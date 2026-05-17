<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Pauma\Config;
use Pauma\Database;

$token = (string) ($_GET['t'] ?? '');
$token = preg_replace('/[^a-f0-9]/i', '', $token);

if (strlen($token) !== 64 || !Database::isConfigured()) {
    redirectTo('/app/?login=invalid');
}

try {
    $pdo = Database::pdo();
    $hash = hash('sha256', $token);
    $stmt = $pdo->prepare('SELECT id, user_id FROM login_tokens
                           WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
                           LIMIT 1');
    $stmt->execute([$hash]);
    $row = $stmt->fetch();

    if (!$row) {
        redirectTo('/app/?login=expired');
    }

    // marcar como usado
    $pdo->prepare('UPDATE login_tokens SET used_at = NOW() WHERE id = ?')
        ->execute([$row['id']]);
    $pdo->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = ?')
        ->execute([$row['user_id']]);

    // crear cookie de sesion firmada
    $secret = Config::get('APP_SECRET', 'cambia-este-secreto');
    $userId = (int) $row['user_id'];
    $expires = time() + 60 * 60 * 24 * 30; // 30 dias
    $payload = $userId . '.' . $expires;
    $sig = hash_hmac('sha256', $payload, $secret);
    $sessionValue = $payload . '.' . $sig;

    setcookie('pauma_session', $sessionValue, [
        'expires' => $expires,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    redirectTo('/app/?login=ok');
} catch (\Throwable $e) {
    error_log('[pauma verify] ' . $e->getMessage());
    redirectTo('/app/?login=error');
}

function redirectTo(string $path): never
{
    header('Location: ' . $path, true, 302);
    header('Cache-Control: no-store');
    exit;
}
