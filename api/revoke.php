<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Pauma\Config;
use Pauma\Deepgram;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

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

$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$keyId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($body['key_id'] ?? ''));
if (!$keyId) {
    http_response_code(400);
    echo json_encode(['error' => 'missing_key_id']);
    exit;
}

$apiKey = Config::get('DEEPGRAM_API_KEY');
$projectId = Config::get('DEEPGRAM_PROJECT_ID');
if (!$apiKey || !$projectId) {
    http_response_code(503);
    echo json_encode(['error' => 'not_configured']);
    exit;
}

try {
    $ok = (new Deepgram($apiKey, $projectId))->revokeKey($keyId);
    echo json_encode(['ok' => $ok]);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'revoke_failed']);
}
