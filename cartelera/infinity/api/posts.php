<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (isset($_GET['episodes'])) {
            $postId = (int) $_GET['episodes'];
            respond(['episodes' => $postService->episodes($postId)]);
        }
        if (isset($_GET['reviews'])) {
            $postId = (int) $_GET['reviews'];
            respond(['reviews' => $postService->reviews($postId)]);
        }

        $query = trim((string) ($_GET['q'] ?? ''));
        $type = isset($_GET['type']) && $_GET['type'] !== '' ? (string) $_GET['type'] : null;
        $viewer = current_user($userRepository);
        $posts = $postService->search($query !== '' ? $query : null, $type, $viewer?->id);
        respond(['posts' => $posts]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = request_data();
        if (($input['action'] ?? '') === 'register_view') {
            $postId = (int) ($input['post_id'] ?? 0);
            respond(['views_count' => $postService->registerView($postId)]);
        }

        $user = current_user($userRepository);
        if ($user === null) {
            respond(['error' => 'Iniciá sesión para publicar un enlace.'], 401);
        }

        if (($input['action'] ?? '') === 'toggle_like') {
            $postId = (int) ($input['post_id'] ?? 0);
            if ($postId < 1) {
                respond(['error' => 'Falta la publicación a valorar.'], 422);
            }
            respond(['result' => $postService->toggleLike($postId, $user->id)]);
        }

        if (($input['action'] ?? '') === 'save_review') {
            $postId = (int) ($input['post_id'] ?? 0);
            $rating = (int) ($input['rating'] ?? 0);
            $review = isset($input['review']) ? (string) $input['review'] : null;
            if ($postId < 1) {
                respond(['error' => 'Falta la publicación a reseñar.'], 422);
            }
            respond(['result' => $postService->saveReview($postId, $user->id, $rating, $review)]);
        }

        if (($input['action'] ?? '') === 'update_post') {
            $postId = (int) ($input['post_id'] ?? 0);
            if ($postId < 1) {
                respond(['error' => 'Falta la publicación a editar.'], 422);
            }
            respond(['post' => $postService->update($postId, $user->id, $input)]);
        }

        respond(['post' => $postService->publish($user->id, $input)], 201);
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
