<?php
declare(strict_types=1);

spl_autoload_register(function (string $class): void {
    if (!str_starts_with($class, 'Pauma\\')) {
        return;
    }
    $path = __DIR__ . '/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($path)) {
        require_once $path;
    }
});

Pauma\Config::boot(dirname(__DIR__) . '/.env');
