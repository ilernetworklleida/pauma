<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Maluap\Config;
use Maluap\RateLimiter;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$origin = Config::get('ALLOWED_ORIGIN', 'https://maluap.es');
$allowed = array_map('trim', explode(',', (string) $origin));
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($reqOrigin && in_array($reqOrigin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $reqOrigin);
    header('Access-Control-Allow-Credentials: true');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$rl = new RateLimiter();
$max = Config::int('RATE_LIMIT_PER_MIN', 20);
if (!$rl->check('transcribe-file:' . RateLimiter::clientIp(), $max)) {
    http_response_code(429);
    echo json_encode(['error' => 'rate_limited']);
    exit;
}

$apiKey = Config::get('DEEPGRAM_API_KEY');
if (!$apiKey) {
    http_response_code(503);
    echo json_encode(['error' => 'not_configured']);
    exit;
}

$lang = preg_replace('/[^a-z\-]/i', '', $_GET['lang'] ?? 'es') ?: 'es';
$langCode = $lang === 'ca' ? 'ca' : ($lang === 'en' ? 'en' : 'es');

// El audio puede llegar como raw body, o como multipart file.
$audio = null;
$contentType = $_SERVER['CONTENT_TYPE'] ?? 'application/octet-stream';

if (!empty($_FILES['audio']['tmp_name'])) {
    $audio = file_get_contents($_FILES['audio']['tmp_name']);
    $contentType = $_FILES['audio']['type'] ?: 'audio/mpeg';
} else {
    $audio = file_get_contents('php://input');
}

if (!$audio || strlen($audio) < 100) {
    http_response_code(400);
    echo json_encode(['error' => 'empty_audio']);
    exit;
}
if (strlen($audio) > 25 * 1024 * 1024) {
    http_response_code(413);
    echo json_encode(['error' => 'too_large', 'limit' => '25MB']);
    exit;
}

$params = http_build_query([
    'model' => 'nova-2',
    'language' => $langCode,
    'diarize' => 'true',
    'punctuate' => 'true',
    'smart_format' => 'true',
    'paragraphs' => 'true',
    'summarize' => 'v2',
    'detect_topics' => 'true',
    'sentiment' => 'true',
]);

$ch = curl_init('https://api.deepgram.com/v1/listen?' . $params);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $audio,
    CURLOPT_HTTPHEADER => [
        'Authorization: Token ' . $apiKey,
        'Content-Type: ' . $contentType,
    ],
    CURLOPT_TIMEOUT => 120,
]);
$res = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($code !== 200 || !$res) {
    http_response_code(502);
    echo json_encode(['error' => 'transcribe_failed', 'upstream_code' => $code]);
    exit;
}

// pasamos la respuesta de Deepgram tal cual al cliente
header('Content-Type: application/json; charset=utf-8');
echo $res;
