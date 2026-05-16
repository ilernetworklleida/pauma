<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Pauma\Config;
use Pauma\RateLimiter;
use Pauma\Deepgram;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$origin = Config::get('ALLOWED_ORIGIN', 'https://maluap.es');
$allowed = array_map('trim', explode(',', (string) $origin));
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($reqOrigin && in_array($reqOrigin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $reqOrigin);
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
$lang = preg_replace('/[^a-z\-]/i', '', $_GET['lang'] ?? 'es') ?: 'es';
$langCode = $lang === 'ca' ? 'ca' : ($lang === 'en' ? 'en' : 'es');

if ($provider === 'deepgram') {
    $apiKey = Config::get('DEEPGRAM_API_KEY');
    $projectId = Config::get('DEEPGRAM_PROJECT_ID');
    $useTemp = Config::get('DEEPGRAM_USE_TEMP_KEYS', '1') === '1';

    if (!$apiKey) {
        http_response_code(503);
        echo json_encode(['error' => 'provider_not_configured', 'provider' => 'deepgram']);
        exit;
    }

    $token = $apiKey;
    $keyId = null;
    $expiresAt = null;

    if ($useTemp && $projectId) {
        try {
            $dg = new Deepgram($apiKey, $projectId);
            $temp = $dg->createTempKey(300);
            $token = $temp['key'];
            $keyId = $temp['key_id'];
            $expiresAt = $temp['expires_at'];
        } catch (\Throwable $e) {
            error_log('[pauma] deepgram temp key failed: ' . $e->getMessage());
            // fallback: use root key (less ideal, but at least functional)
        }
    }

    $params = [
        'model' => 'nova-2',
        'language' => $langCode,
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
        'endpointing' => '300',
    ];

    // Palabras clave personalizadas del usuario (vocabulario personal)
    $keywords = $_GET['keyword'] ?? [];
    if (is_string($keywords)) $keywords = [$keywords];
    $kwClean = [];
    foreach (array_slice((array)$keywords, 0, 30) as $kw) {
        $kw = trim((string) $kw);
        if ($kw === '' || strlen($kw) > 60) continue;
        $kwClean[] = $kw . ':2'; // intensifier 2 = mas peso
    }

    echo json_encode([
        'provider' => 'deepgram',
        'token' => $token,
        'key_id' => $keyId,
        'expires_at' => $expiresAt,
        'ws_url' => 'wss://api.deepgram.com/v1/listen',
        'params' => $params,
        'keywords' => $kwClean,
    ]);
    exit;
}

http_response_code(501);
echo json_encode(['error' => 'unsupported_provider', 'provider' => $provider]);
