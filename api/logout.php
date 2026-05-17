<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

setcookie('pauma_session', '', [
    'expires' => time() - 3600,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(['ok' => true]);
