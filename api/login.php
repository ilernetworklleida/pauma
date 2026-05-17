<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Maluap\Config;
use Maluap\RateLimiter;
use Maluap\Database;
use Maluap\Mailer;

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

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$rl = new RateLimiter();
if (!$rl->check('login:' . RateLimiter::clientIp(), 5)) {
    http_response_code(429);
    echo json_encode(['error' => 'rate_limited', 'message' => 'Demasiados intentos. Espera un minuto.']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$email = strtolower(trim((string) ($body['email'] ?? '')));

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_email']);
    exit;
}

if (!Database::isConfigured()) {
    http_response_code(503);
    echo json_encode(['error' => 'not_configured']);
    exit;
}

try {
    $pdo = Database::pdo();

    // crear usuario si no existe
    $pdo->prepare('INSERT INTO users (email, created_at, last_seen_at) VALUES (?, NOW(), NOW())
                   ON DUPLICATE KEY UPDATE last_seen_at = NOW()')
        ->execute([$email]);

    $userId = (int) $pdo->query('SELECT id FROM users WHERE email = ' . $pdo->quote($email))->fetchColumn();

    // generar token
    $rawToken = bin2hex(random_bytes(32));
    $hash = hash('sha256', $rawToken);
    $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 minutos

    // borrar tokens viejos de este usuario
    $pdo->prepare('DELETE FROM login_tokens WHERE user_id = ? AND (expires_at < NOW() OR used_at IS NOT NULL)')
        ->execute([$userId]);

    $pdo->prepare('INSERT INTO login_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
        ->execute([$userId, $hash, $expiresAt]);

    // enviar email con el link magico
    $magicUrl = 'https://maluap.es/api/verify.php?t=' . urlencode($rawToken);

    $mailer = Mailer::fromConfig();
    $subject = 'Acceso a Maluap';
    $html = '<div style="font-family: -apple-system, sans-serif; max-width: 520px; padding: 24px">';
    $html .= '<h1 style="color: #7c3aed; font-size: 24px">Tu enlace para entrar a Maluap</h1>';
    $html .= '<p>Hola, alguien (esperamos que tú) ha pedido un enlace para entrar a Maluap con este correo.</p>';
    $html .= '<p style="margin: 24px 0">';
    $html .= '<a href="' . htmlspecialchars($magicUrl) . '" style="background: #7c3aed; color: white; padding: 14px 24px; border-radius: 12px; text-decoration: none; font-weight: 600">Entrar a Maluap</a>';
    $html .= '</p>';
    $html .= '<p style="color: #666; font-size: 14px">Este enlace caduca en 10 minutos y solo funciona una vez.</p>';
    $html .= '<p style="color: #666; font-size: 14px">Si no has sido tú, simplemente ignora este correo.</p>';
    $html .= '<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0">';
    $html .= '<p style="color: #999; font-size: 12px">Maluap · Comunicación accesible para personas sordas<br>';
    $html .= '<a href="https://maluap.es" style="color: #7c3aed">maluap.es</a> · ';
    $html .= '<a href="https://maluap.es/privacidad.html" style="color: #7c3aed">Privacidad</a></p>';
    $html .= '</div>';

    $text = "Tu enlace para entrar a Maluap:\n\n{$magicUrl}\n\nCaduca en 10 minutos. Si no has sido tú, ignora este correo.\n\n-- Maluap · maluap.es";

    $mailer->send($email, $subject, $html, $text);

    echo json_encode(['ok' => true, 'message' => 'Te hemos enviado un enlace al correo.']);
} catch (\Throwable $e) {
    error_log('[maluap login] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'login_failed']);
}
