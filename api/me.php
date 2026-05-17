<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Pauma\Config;
use Pauma\Database;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$cookie = $_COOKIE['pauma_session'] ?? '';
if (!$cookie || !Database::isConfigured()) {
    echo json_encode(['logged_in' => false]);
    exit;
}

$parts = explode('.', $cookie);
if (count($parts) !== 3) {
    echo json_encode(['logged_in' => false]);
    exit;
}
[$userId, $expires, $sig] = $parts;
$secret = Config::get('APP_SECRET', 'cambia-este-secreto');
$expected = hash_hmac('sha256', $userId . '.' . $expires, $secret);

if (!hash_equals($expected, $sig) || (int) $expires < time()) {
    echo json_encode(['logged_in' => false]);
    exit;
}

try {
    $pdo = Database::pdo();
    $stmt = $pdo->prepare('SELECT id, email, display_name FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([(int) $userId]);
    $u = $stmt->fetch();
    if (!$u) {
        echo json_encode(['logged_in' => false]);
        exit;
    }
    echo json_encode([
        'logged_in' => true,
        'user' => [
            'id' => (int) $u['id'],
            'email' => $u['email'],
            'name' => $u['display_name'],
        ],
    ]);
} catch (\Throwable $e) {
    error_log('[pauma me] ' . $e->getMessage());
    echo json_encode(['logged_in' => false]);
}
