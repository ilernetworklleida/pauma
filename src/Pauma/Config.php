<?php
declare(strict_types=1);

namespace Pauma;

final class Config
{
    private static array $env = [];
    private static bool $booted = false;

    public static function boot(string $envPath): void
    {
        if (self::$booted) return;
        self::$booted = true;

        if (!is_file($envPath)) return;

        foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            if (!str_contains($line, '=')) continue;
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v);
            if (($v[0] ?? '') === '"' || ($v[0] ?? '') === "'") {
                $v = substr($v, 1, -1);
            }
            self::$env[$k] = $v;
        }
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $val = self::$env[$key] ?? $_ENV[$key] ?? getenv($key);
        if ($val === false || $val === null || $val === '') {
            return $default;
        }
        return $val;
    }

    public static function int(string $key, int $default): int
    {
        $val = self::get($key);
        return $val !== null ? (int) $val : $default;
    }
}
