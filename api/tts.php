<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Pauma\Config;
use Pauma\RateLimiter;

$origin = Config::get('ALLOWED_ORIGIN', 'https://maluap.es');
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($reqOrigin && $reqOrigin === $origin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

header('X-Content-Type-Options: nosniff');

$rl = new RateLimiter();
$max = Config::int('RATE_LIMIT_PER_MIN', 20);
if (!$rl->check('tts:' . RateLimiter::clientIp(), $max)) {
    http_response_code(429);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'rate_limited']);
    exit;
}

$key = Config::get('ELEVENLABS_API_KEY');
if (!$key) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'tts_not_configured']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$text = trim((string)($body['text'] ?? ''));
$voice = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($body['voice'] ?? '')) ?: Config::get('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM');
$model = Config::get('ELEVENLABS_MODEL', 'eleven_multilingual_v2');

if ($text === '' || mb_strlen($text) > 800) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'invalid_text']);
    exit;
}

$url = "https://api.elevenlabs.io/v1/text-to-speech/{$voice}";
$payload = json_encode([
    'text' => $text,
    'model_id' => $model,
    'voice_settings' => [
        'stability' => 0.55,
        'similarity_boost' => 0.85,
        'style' => 0.0,
        'use_speaker_boost' => true,
    ],
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'xi-api-key: ' . $key,
        'Content-Type: application/json',
        'Accept: audio/mpeg',
    ],
    CURLOPT_TIMEOUT => 20,
]);
$audio = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($code !== 200 || !$audio) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'tts_error', 'upstream_code' => $code]);
    exit;
}

header('Content-Type: audio/mpeg');
header('Cache-Control: no-store');
echo $audio;
