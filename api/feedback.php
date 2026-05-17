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
if (!$rl->check('feedback:' . RateLimiter::clientIp(), 5)) {
    http_response_code(429);
    echo json_encode(['error' => 'rate_limited', 'message' => 'Demasiados envíos. Espera un minuto.']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$email    = trim((string) ($body['email'] ?? ''));
$category = preg_replace('/[^a-z_-]/i', '', (string) ($body['category'] ?? 'general'));
$message  = trim((string) ($body['message'] ?? ''));
$honeypot = trim((string) ($body['url'] ?? ''));

// honeypot anti-spam
if ($honeypot !== '') {
    echo json_encode(['ok' => true]);
    exit;
}

if (mb_strlen($message) < 5 || mb_strlen($message) > 5000) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_message']);
    exit;
}
if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_email']);
    exit;
}

// guardar en DB si esta configurada
$saved = false;
if (Database::isConfigured()) {
    try {
        $pdo = Database::pdo();
        $pdo->prepare('INSERT INTO feedback (email_optional, category, message, user_agent) VALUES (?, ?, ?, ?)')
            ->execute([
                $email ?: null,
                $category ?: 'general',
                $message,
                substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
            ]);
        $saved = true;
    } catch (\Throwable $e) {
        error_log('[maluap feedback db] ' . $e->getMessage());
    }
}

// notificar por email a hola@maluap.es
$emailSent = false;
try {
    $mailer = Mailer::fromConfig();
    $subject = '[Maluap feedback] ' . $category . ' · ' . substr($message, 0, 40);
    $html = '<div style="font-family: -apple-system, sans-serif; max-width: 560px">';
    $html .= '<h2 style="color: #7c3aed">Nuevo feedback en Maluap</h2>';
    $html .= '<p><strong>Categoría:</strong> ' . htmlspecialchars($category) . '</p>';
    if ($email) $html .= '<p><strong>De:</strong> ' . htmlspecialchars($email) . '</p>';
    $html .= '<p><strong>Mensaje:</strong></p>';
    $html .= '<div style="background: #f5f5f5; padding: 16px; border-radius: 8px; white-space: pre-wrap;">' . htmlspecialchars($message) . '</div>';
    $html .= '<hr><p style="color: #999; font-size: 12px">User agent: ' . htmlspecialchars(substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200)) . '</p>';
    $html .= '</div>';

    $text = "Nuevo feedback en Maluap\n\nCategoría: {$category}\n";
    if ($email) $text .= "De: {$email}\n";
    $text .= "\nMensaje:\n{$message}\n";

    $to = Config::get('FEEDBACK_TO', Config::get('SMTP_FROM', 'hola@maluap.es'));
    $emailSent = $mailer->send($to, $subject, $html, $text, $email ?: null);
} catch (\Throwable $e) {
    error_log('[maluap feedback mail] ' . $e->getMessage());
}

if (!$saved && !$emailSent) {
    http_response_code(502);
    echo json_encode(['error' => 'send_failed', 'message' => 'No se pudo enviar. Inténtalo más tarde.']);
    exit;
}

echo json_encode(['ok' => true, 'saved' => $saved, 'email_sent' => $emailSent]);
