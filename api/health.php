<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Pauma\Config;
use Pauma\Database;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$out = [
    'version' => 'v0.3',
    'time' => date('c'),
    'checks' => [
        'php' => PHP_VERSION,
        'deepgram_configured' => (bool) Config::get('DEEPGRAM_API_KEY'),
        'elevenlabs_configured' => (bool) Config::get('ELEVENLABS_API_KEY'),
        'db_configured' => Database::isConfigured(),
    ],
];

if (Database::isConfigured()) {
    $out['checks']['db_connection'] = Database::healthCheck();
}

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
