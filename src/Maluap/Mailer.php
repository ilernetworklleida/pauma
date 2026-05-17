<?php
declare(strict_types=1);

namespace Maluap;

/**
 * Cliente SMTP minimalista sin dependencias.
 * Soporta SMTPS (implicit TLS, puerto 465) y plain (STARTTLS, 587).
 * Suficiente para envios transaccionales (magic link login, feedback).
 */
final class Mailer
{
    public function __construct(
        private string $host,
        private int $port,
        private string $user,
        private string $pass,
        private string $from,
        private string $fromName = 'Maluap',
    ) {}

    public static function fromConfig(): self
    {
        return new self(
            host: Config::get('SMTP_HOST', 'smtp.hostinger.com'),
            port: Config::int('SMTP_PORT', 465),
            user: Config::get('SMTP_USER', ''),
            pass: Config::get('SMTP_PASS', ''),
            from: Config::get('SMTP_FROM', Config::get('SMTP_USER', '')),
            fromName: Config::get('SMTP_FROM_NAME', 'Maluap'),
        );
    }

    public function send(string $to, string $subject, string $bodyHtml, ?string $bodyText = null, ?string $replyTo = null): bool
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('invalid_recipient');
        }
        if (!$this->user || !$this->pass) {
            throw new \RuntimeException('smtp_not_configured');
        }

        $tls = $this->port === 465;
        $ctx = stream_context_create([
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'crypto_method' => STREAM_CRYPTO_METHOD_TLS_CLIENT],
        ]);
        $proto = $tls ? 'ssl://' : 'tcp://';
        $sock = @stream_socket_client(
            $proto . $this->host . ':' . $this->port,
            $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $ctx
        );
        if (!$sock) {
            throw new \RuntimeException("smtp_connect_failed: {$errno} {$errstr}");
        }
        stream_set_timeout($sock, 20);

        try {
            $this->expect($sock, 220);
            $this->cmd($sock, 'EHLO maluap.es', 250);

            if (!$tls) {
                $this->cmd($sock, 'STARTTLS', 220);
                if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('starttls_failed');
                }
                $this->cmd($sock, 'EHLO maluap.es', 250);
            }

            $this->cmd($sock, 'AUTH LOGIN', 334);
            $this->cmd($sock, base64_encode($this->user), 334);
            $this->cmd($sock, base64_encode($this->pass), 235);

            $this->cmd($sock, 'MAIL FROM:<' . $this->from . '>', 250);
            $this->cmd($sock, 'RCPT TO:<' . $to . '>', [250, 251]);
            $this->cmd($sock, 'DATA', 354);

            $boundary = 'maluap-' . bin2hex(random_bytes(8));
            $messageId = bin2hex(random_bytes(12)) . '@maluap.es';

            $headers = [
                'From: ' . $this->encodeName($this->fromName) . ' <' . $this->from . '>',
                'To: <' . $to . '>',
                'Subject: ' . $this->encodeHeader($subject),
                'Date: ' . date('r'),
                'Message-ID: <' . $messageId . '>',
                'MIME-Version: 1.0',
                'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
            ];
            if ($replyTo) $headers[] = 'Reply-To: <' . $replyTo . '>';

            $body = '';
            if ($bodyText) {
                $body .= "--{$boundary}\r\n";
                $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
                $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
                $body .= $this->dotStuff($bodyText) . "\r\n";
            }
            $body .= "--{$boundary}\r\n";
            $body .= "Content-Type: text/html; charset=UTF-8\r\n";
            $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
            $body .= $this->dotStuff($bodyHtml) . "\r\n";
            $body .= "--{$boundary}--\r\n";

            fwrite($sock, implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.\r\n");
            $this->expect($sock, 250);

            @fwrite($sock, "QUIT\r\n");
            @fclose($sock);
            return true;
        } catch (\Throwable $e) {
            @fclose($sock);
            throw $e;
        }
    }

    private function cmd($sock, string $cmd, int|array $expect): void
    {
        fwrite($sock, $cmd . "\r\n");
        $this->expect($sock, $expect);
    }

    private function expect($sock, int|array $codes): string
    {
        $codes = (array) $codes;
        $line = '';
        while (($l = fgets($sock, 1024)) !== false) {
            $line .= $l;
            if (preg_match('/^\d{3} /', $l)) break;
        }
        $code = (int) substr($line, 0, 3);
        if (!in_array($code, $codes, true)) {
            throw new \RuntimeException("smtp_unexpected: expected " . implode('/', $codes) . ", got: " . trim($line));
        }
        return $line;
    }

    private function encodeHeader(string $s): string
    {
        return mb_check_encoding($s, 'ASCII')
            ? $s
            : '=?UTF-8?B?' . base64_encode($s) . '?=';
    }

    private function encodeName(string $s): string
    {
        return $this->encodeHeader($s);
    }

    private function dotStuff(string $body): string
    {
        // SMTP RFC 5321 dot-stuffing: lineas que empiecen por "." se escapan a ".."
        return preg_replace('/^\./m', '..', $body);
    }
}
