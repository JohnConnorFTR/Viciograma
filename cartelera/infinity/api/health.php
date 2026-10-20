<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$dataDirectory = __DIR__ . '/data';
$checks = [
    'php' => PHP_VERSION_ID >= 80100,
    'pdo_sqlite' => extension_loaded('pdo_sqlite') && in_array('sqlite', PDO::getAvailableDrivers(), true),
    'mbstring' => extension_loaded('mbstring'),
    'data_directory' => is_dir($dataDirectory) && is_writable($dataDirectory),
];
$checks['database'] = false;

if ($checks['php'] && $checks['pdo_sqlite'] && $checks['data_directory']) {
    try {
        require_once __DIR__ . '/Infrastructure/SqliteDatabase.php';
        $database = new \Cartelera\Infrastructure\SqliteDatabase($dataDirectory . '/cartelera.sqlite');
        $checks['database'] = $database->connection() instanceof PDO;
    } catch (Throwable $exception) {
        error_log('Viciograma Cartelera health check failed: ' . $exception->getMessage());
    }
}

$healthy = !in_array(false, $checks, true);
http_response_code($healthy ? 200 : 503);
echo json_encode([
    'status' => $healthy ? 'ok' : 'needs_attention',
    'checks' => $checks,
    'message' => $healthy
        ? 'PHP, SQLite y permisos están listos.'
        : 'El hosting debe habilitar PHP 8.1+, PDO SQLite, mbstring y escritura en api/data.',
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
