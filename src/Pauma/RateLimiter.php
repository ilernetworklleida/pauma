<?php
declare(strict_types=1);

namespace Pauma;

final class RateLimiter
{
    private string $dir;

    public function __construct(?string $dir = null)
    {
        $this->dir = $dir ?? sys_get_temp_dir() . '/pauma-rl';
        if (!is_dir($this->dir)) {
            @mkdir($this->dir, 0700, true);
        }
    }

    public function check(string $bucket, int $maxPerMinute): bool
    {
        $key = preg_replace('/[^a-zA-Z0-9_]/', '_', $bucket);
        $file = $this->dir . '/' . $key;
        $now = time();
        $window = 60;

        $hits = [];
        if (is_file($file)) {
            $raw = @file_get_contents($file);
            if ($raw !== false) {
                $hits = array_filter(
                    array_map('intval', explode("\n", trim($raw))),
                    fn($t) => $t > ($now - $window)
                );
            }
        }

        if (count($hits) >= $maxPerMinute) {
            return false;
        }

        $hits[] = $now;
        @file_put_contents($file, implode("\n", $hits), LOCK_EX);
        return true;
    }

    public static function clientIp(): string
    {
        $candidates = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'REMOTE_ADDR',
        ];
        foreach ($candidates as $k) {
            if (!empty($_SERVER[$k])) {
                $ip = explode(',', $_SERVER[$k])[0];
                return trim($ip);
            }
        }
        return '0.0.0.0';
    }
}
