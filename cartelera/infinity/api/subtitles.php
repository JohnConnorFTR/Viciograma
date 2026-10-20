<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Cartelera\Infrastructure\SqlitePostRepository;

try {
    $posts = new SqlitePostRepository($connection);

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        http_response_code(204);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['file'])) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Cross-Origin-Resource-Policy: cross-origin');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        $subtitle = $posts->subtitleById((int) $_GET['file']);
        if ($subtitle === null) {
            http_response_code(404);
            exit;
        }

        $content = $subtitle['content'];
        if (is_resource($content)) {
            $content = stream_get_contents($content);
        }
        if (!is_string($content)) {
            throw new RuntimeException('No se pudo leer el subtítulo almacenado.');
        }

        $format = strtolower((string) $subtitle['format']);
        $filename = preg_replace('/[^a-zA-Z0-9._ -]/', '_', (string) $subtitle['original_name']);
        header('Content-Type: ' . ($format === 'vtt' ? 'text/vtt' : 'text/plain') . '; charset=utf-8');
        header('Content-Disposition: inline; filename="' . str_replace('"', '', $filename) . '"');
        header('Content-Length: ' . strlen($content));
        echo $content;
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['post'])) {
        $postId = filter_var($_GET['post'], FILTER_VALIDATE_INT);
        if ($postId === false || $postId < 1) {
            respond(['error' => 'La publicación no es válida.'], 422);
        }
        respond(['subtitles' => $posts->subtitlesForPost($postId)]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $user = current_user($userRepository);
        if ($user === null) {
            respond(['error' => 'Iniciá sesión para subir subtítulos.'], 401);
        }

        $postId = filter_var($_POST['post_id'] ?? null, FILTER_VALIDATE_INT);
        $targetKey = trim((string) ($_POST['target_key'] ?? ''));
        if ($postId === false || $postId < 1 || !$posts->ownsPost($postId, $user->id)) {
            respond(['error' => 'No se encontró una publicación tuya para adjuntar el subtítulo.'], 404);
        }

        if ($targetKey !== 'post' && !preg_match('/^episode:([1-9]\d{0,2}):([1-9]\d{0,3})$/', $targetKey, $matches)) {
            respond(['error' => 'Elegí una publicación o episodio válido para el subtítulo.'], 422);
        }
        if ($targetKey !== 'post' && !$posts->episodeExists($postId, (int) $matches[1], (int) $matches[2])) {
            respond(['error' => 'No se encontró ese episodio en la publicación. Guardá primero los cambios de la serie.'], 422);
        }

        $upload = $_FILES['subtitle'] ?? null;
        if (!is_array($upload) || (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $uploadError = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
            $message = match ($uploadError) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'El subtítulo supera el límite de tamaño del servidor.',
                UPLOAD_ERR_PARTIAL => 'El subtítulo se recibió incompleto. Volvé a intentarlo.',
                UPLOAD_ERR_NO_FILE => 'Elegí un archivo de subtítulos.',
                default => 'No se pudo recibir el archivo de subtítulos.',
            };
            respond(['error' => $message], 422);
        }

        $originalName = basename((string) ($upload['name'] ?? 'subtitles'));
        $format = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $allowedFormats = ['vtt', 'srt', 'ass', 'ssa', 'sub', 'smi', 'sami', 'sbv', 'ttml', 'dfxp', 'xml', 'stl', 'scc', 'mpl', 'mpl2', 'txt'];
        if (!in_array($format, $allowedFormats, true)) {
            respond(['error' => 'Formato no admitido. Elegí un subtítulo de texto como VTT, SRT, ASS/SSA, SUB, SBV o TTML.'], 415);
        }

        $fileSize = (int) ($upload['size'] ?? 0);
        if ($fileSize < 1 || $fileSize > 5 * 1024 * 1024) {
            respond(['error' => 'El subtítulo debe pesar menos de 5 MB.'], 413);
        }
        if (!is_uploaded_file((string) ($upload['tmp_name'] ?? ''))) {
            respond(['error' => 'El archivo recibido no es una carga válida.'], 400);
        }

        $content = file_get_contents((string) $upload['tmp_name']);
        if (!is_string($content) || $content === '' || str_contains($content, "\0")) {
            respond(['error' => 'El subtítulo debe ser un archivo de texto válido.'], 415);
        }
        if (str_starts_with($content, "\xFF\xFE")) {
            $content = mb_convert_encoding(substr($content, 2), 'UTF-8', 'UTF-16LE');
        } elseif (str_starts_with($content, "\xFE\xFF")) {
            $content = mb_convert_encoding(substr($content, 2), 'UTF-8', 'UTF-16BE');
        } elseif (str_starts_with($content, "\xEF\xBB\xBF")) {
            $content = substr($content, 3);
        } elseif (!mb_check_encoding($content, 'UTF-8')) {
            $content = mb_convert_encoding($content, 'UTF-8', 'Windows-1252');
        }

        $subtitleId = $posts->saveSubtitle(
            $postId,
            $targetKey,
            mb_substr($originalName, 0, 180),
            $format,
            $content
        );
        respond(['ok' => true, 'id' => $subtitleId, 'target_key' => $targetKey]);
    }

    header('Allow: GET, POST, OPTIONS');
    respond(['error' => 'Método no permitido.'], 405);
} catch (InvalidArgumentException $exception) {
    respond(['error' => $exception->getMessage()], 422);
} catch (Throwable $exception) {
    error_log('Viciograma Cartelera subtitle request failed: ' . $exception->getMessage());
    respond(['error' => 'No se pudo procesar el subtítulo.'], 500);
}
