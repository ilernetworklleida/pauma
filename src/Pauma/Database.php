<?php
declare(strict_types=1);

namespace Pauma;

final class Database
{
    private static ?\PDO $pdo = null;

    public static function pdo(): \PDO
    {
        if (self::$pdo) return self::$pdo;

        $host = Config::get('DB_HOST', 'localhost');
        $port = Config::get('DB_PORT', '3306');
        $name = Config::get('DB_NAME');
        $user = Config::get('DB_USER');
        $pass = Config::get('DB_PASS');
        $charset = Config::get('DB_CHARSET', 'utf8mb4');

        if (!$name || !$user) {
            throw new \RuntimeException('database_not_configured');
        }

        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";
        self::$pdo = new \PDO($dsn, $user, $pass, [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
            \PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$charset} COLLATE {$charset}_unicode_ci",
        ]);
        return self::$pdo;
    }

    public static function isConfigured(): bool
    {
        return (bool) (Config::get('DB_NAME') && Config::get('DB_USER'));
    }

    public static function healthCheck(): bool
    {
        try {
            return (bool) self::pdo()->query('SELECT 1')->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }
}
