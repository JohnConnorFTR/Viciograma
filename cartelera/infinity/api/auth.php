<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? '';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'me') {
        $user = current_user($userRepository);
        respond(['user' => $user?->toArray()]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: GET, POST');
        respond(['error' => 'Método no permitido.'], 405);
    }

    $input = request_data();
    if ($action === 'register') {
        $user = $authService->register($input);
        session_regenerate_id(true);
        $_SESSION['user_id'] = $user->id;
        respond(['user' => $user->toArray()], 201);
    }
    if ($action === 'login') {
        $user = $authService->login($input);
        session_regenerate_id(true);
        $_SESSION['user_id'] = $user->id;
        respond(['user' => $user->toArray()]);
    }
    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $cookie = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $cookie['path'],
                'secure' => $cookie['secure'],
                'httponly' => $cookie['httponly'],
                'samesite' => $cookie['samesite'],
            ]);
        }
        session_destroy();
        respond(['ok' => true]);
    }

    respond(['error' => 'La acción solicitada no existe.'], 404);
} catch (InvalidArgumentException $exception) {
    respond(['error' => $exception->getMessage()], 422);
} catch (Throwable $exception) {
    error_log('Viciograma Cartelera authentication request failed: ' . $exception->getMessage());
    respond(['error' => 'No se pudo procesar la solicitud de cuenta.'], 500);
}
