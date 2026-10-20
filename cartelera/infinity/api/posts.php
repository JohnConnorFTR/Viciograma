<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $query = trim((string) ($_GET['q'] ?? ''));
        $type = isset($_GET['type']) && $_GET['type'] !== '' ? (string) $_GET['type'] : null;
        respond(['posts' => $postService->search($query, $type)]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $user = current_user($userRepository);
        if ($user === null) {
            respond(['error' => 'Iniciá sesión para publicar un enlace.'], 401);
        }
        respond(['post' => $postService->publish($user->id, request_data())], 201);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $user = current_user($userRepository);
        if ($user === null) {
            respond(['error' => 'Iniciá sesión para eliminar una publicación.'], 401);
        }
        $postService->delete((int) ($_GET['id'] ?? 0), $user->id);
        respond(['ok' => true]);
    }

    header('Allow: GET, POST, DELETE');
    respond(['error' => 'Método no permitido.'], 405);
} catch (InvalidArgumentException $exception) {
    respond(['error' => $exception->getMessage()], 422);
} catch (Throwable $exception) {
    error_log('Viciograma Cartelera posts request failed: ' . $exception->getMessage());
    respond(['error' => 'No se pudo procesar la publicación.'], 500);
}
