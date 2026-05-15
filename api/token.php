<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Pauma\Config;
use Pauma\RateLimiter;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$origin = Config::get('ALLOWED_ORIGIN', 'https://maluap.es');
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($reqOrigin && $reqOrigin === $origin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$rl = new RateLimiter();
$max = Config::int('RATE_LIMIT_PER_MIN', 20);
if (!$rl->check('token:' . RateLimiter::clientIp(), $max)) {
    http_response_code(429);
    echo json_encode(['error' => 'rate_limited', 'retry_after' => 60]);
    exit;
}

$provider = Config::get('TRANSCRIBE_PROVIDER', 'deepgram');
$lang = $_GET['lang'] ?? 'es';
$lang = preg_replace('/[^a-z\-]/i', '', $lang) ?: 'es';

if ($provider === 'deepgram') {
    $key = Config::get('DEEPGRAM_API_KEY');
    if (!$key) {
        http_response_code(503);
        echo json_encode(['error' => 'provider_not_configured', 'provider' => 'deepgram']);
        exit;
    }
    echo json_encode([
        'provider' => 'deepgram',
        'token' => $key,
        'ws_url' => 'wss://api.deepgram.com/v1/listen',
        'params' => [
            'model' => 'nova-2',
            'language' => $lang === 'ca' ? 'ca' : ($lang === 'en' ? 'en' : 'es'),
            'diarize' => 'true',
            'punctuate' => 'true',
            'smart_format' => 'true',
            'interim_results' => 'true',
            'utterances' => 'true',
            'utterance_end_ms' => '1000',
            'vad_events' => 'true',
            'encoding' => 'linear16',
            'sample_rate' => '16000',
            'channels' => '1',
        ],
    ]);
    exit;
}

if ($provider === 'assemblyai') {
    $key = Config::get('ASSEMBLYAI_API_KEY');
    if (!$key) {
        http_response_code(503);
        echo json_encode(['error' => 'provider_not_configured', 'provider' => 'assemblyai']);
        exit;
    }
    $ch = curl_init('https://streaming.assemblyai.com/v3/token?expires_in_seconds=300');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: ' . $key],
        CURLOPT_TIMEOUT => 8,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !$res) {
        http_response_code(502);
        echo json_encode(['error' => 'provider_error']);
        exit;
    }
    $data = json_decode($res, true) ?: [];
    echo json_encode([
        'provider' => 'assemblyai',
        'token' => $data['token'] ?? null,
        'ws_url' => 'wss://streaming.assemblyai.com/v3/ws',
    ]);
    exit;
}

http_response_code(501);
echo json_encode(['error' => 'unsupported_provider', 'provider' => $provider]);
