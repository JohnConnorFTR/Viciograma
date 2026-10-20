<?php
declare(strict_types=1);

namespace Cartelera\Application;

use Cartelera\Domain\MediaPost;
use Cartelera\Infrastructure\SqlitePostRepository;

final class PostService
{
    private const TYPES = ['movie', 'series', 'video'];

    public function __construct(private readonly SqlitePostRepository $posts)
    {
    }

    public function search(?string $query, ?string $type): array
    {
        $query = $query === null ? null : trim($query);
        if ($query !== null && mb_strlen($query) > 100) {
            throw new \InvalidArgumentException('La búsqueda no puede superar los 100 caracteres.');
        }
        if ($type !== null && !in_array($type, self::TYPES, true)) {
            throw new \InvalidArgumentException('El filtro de tipo no es válido.');
        }

        return array_map(
            static fn (MediaPost $post): array => $post->toArray(),
            $this->posts->search($query, $type)
        );
    }

    public function publish(int $userId, array $input): array
    {
        $title = trim((string) ($input['title'] ?? ''));
        $type = (string) ($input['type'] ?? '');
        $genre = trim((string) ($input['genre'] ?? ''));
        $description = trim((string) ($input['description'] ?? ''));
        $linkUrl = trim((string) ($input['link_url'] ?? ''));
        $posterUrl = trim((string) ($input['poster_url'] ?? ''));
        $yearInput = trim((string) ($input['year'] ?? ''));

        if ($title === '' || mb_strlen($title) > 120) {
            throw new \InvalidArgumentException('El título es obligatorio y no puede superar los 120 caracteres.');
        }
        if (!in_array($type, self::TYPES, true)) {
            throw new \InvalidArgumentException('Elegí un tipo de publicación válido.');
        }
        if ($genre !== '' && mb_strlen($genre) > 40) {
            throw new \InvalidArgumentException('El género no puede superar los 40 caracteres.');
        }
        if (mb_strlen($description) > 600) {
            throw new \InvalidArgumentException('La descripción no puede superar los 600 caracteres.');
        }
        if (!$this->isHttpUrl($linkUrl)) {
            throw new \InvalidArgumentException('Ingresá un enlace externo válido que empiece con http:// o https://.');
        }
        if ($posterUrl !== '' && !$this->isHttpUrl($posterUrl)) {
            throw new \InvalidArgumentException('La portada debe ser una URL http:// o https:// válida.');
        }

        $year = null;
        if ($yearInput !== '') {
            if (!ctype_digit($yearInput) || (int) $yearInput < 1888 || (int) $yearInput > 2100) {
                throw new \InvalidArgumentException('El año debe estar entre 1888 y 2100.');
            }
            $year = (int) $yearInput;
        }

        return $this->posts->create($userId, [
            'title' => $title,
            'type' => $type,
            'year' => $year,
            'genre' => $genre === '' ? null : $genre,
            'description' => $description === '' ? null : $description,
            'link_url' => $linkUrl,
            'poster_url' => $posterUrl === '' ? null : $posterUrl,
        ])->toArray();
    }

    public function delete(int $postId, int $userId): void
    {
        if ($postId < 1 || !$this->posts->delete($postId, $userId)) {
            throw new \InvalidArgumentException('No se encontró una publicación tuya con ese identificador.');
        }
    }

    private function isHttpUrl(string $value): bool
    {
        if (filter_var($value, FILTER_VALIDATE_URL) === false) {
            return false;
        }
        $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));
        $host = (string) parse_url($value, PHP_URL_HOST);

        return in_array($scheme, ['http', 'https'], true) && $host !== '';
    }
}
