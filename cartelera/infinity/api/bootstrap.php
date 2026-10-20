<?php
declare(strict_types=1);

use Cartelera\Application\AuthService;
use Cartelera\Application\PostService;
use Cartelera\Infrastructure\SqliteDatabase;
use Cartelera\Infrastructure\SqlitePostRepository;
use Cartelera\Infrastructure\SqliteUserRepository;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

ini_set('display_errors', '0');
error_reporting(E_ALL);

spl_autoload_register(static function (string $class): void {
    $prefix = 'Cartelera\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relativeClass = substr($class, strlen($prefix));
    $path = __DIR__ . '/' . str_replace('\\', DIRECTORY_SEPARATOR, $relativeClass) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

$isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower($_SERVER['HTTPS']) !== 'off';
session_name('viciograma_cartelera');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function request_data(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($contentType, 'application/json')) {
        respond(['error' => 'La solicitud debe enviarse como JSON.'], 415);
    }
    $data = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($data)) {
        respond(['error' => 'El contenido JSON de la solicitud no es válido.'], 400);
    }

    return $data;
}

function current_user(SqliteUserRepository $users): ?\Cartelera\Domain\User
{
    $id = $_SESSION['user_id'] ?? null;
    return is_int($id) ? $users->findById($id) : null;
}

function services(): array
{
    $databasePath = __DIR__ . '/data/cartelera.sqlite';
    $connection = (new SqliteDatabase($databasePath))->connection();
    $users = new SqliteUserRepository($connection);

    return [
        $users,
        new AuthService($users),
        new PostService(new SqlitePostRepository($connection)),
        $connection,
    ];
}

try {
    [$userRepository, $authService, $postService, $connection] = services();
} catch (Throwable $exception) {
    error_log('Viciograma Cartelera database initialization failed: ' . $exception->getMessage());
    respond(['error' => 'El servicio de publicaciones no está disponible. Verificá que el hosting tenga PDO SQLite habilitado y permisos de escritura en api/data.'], 503);
}
