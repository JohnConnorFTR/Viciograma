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

    public function search(?string $query, ?string $type, ?int $viewerId = null): array
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
            $this->posts->search($query, $type, $viewerId)
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
        $episodes = $this->validateEpisodes($type, $input['episodes'] ?? []);

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
            'episodes' => $episodes,
        ])->toArray();
    }

    public function delete(int $postId, int $userId): void
    {
        if ($postId < 1 || !$this->posts->delete($postId, $userId)) {
            throw new \InvalidArgumentException('No se encontró una publicación tuya con ese identificador.');
        }
    }

    public function update(int $postId, int $userId, array $input): array
    {
        if ($postId < 1) {
            throw new \InvalidArgumentException('La publicación no es válida.');
        }

        $title = trim((string) ($input['title'] ?? ''));
        $type = (string) ($input['type'] ?? '');
        $genre = trim((string) ($input['genre'] ?? ''));
        $description = trim((string) ($input['description'] ?? ''));
        $linkUrl = trim((string) ($input['link_url'] ?? ''));
        $posterUrl = trim((string) ($input['poster_url'] ?? ''));
        $yearInput = trim((string) ($input['year'] ?? ''));
        $episodes = $this->validateEpisodes($type, $input['episodes'] ?? []);

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

        return $this->posts->update($postId, $userId, [
            'title' => $title,
            'type' => $type,
            'year' => $year,
            'genre' => $genre === '' ? null : $genre,
            'description' => $description === '' ? null : $description,
            'link_url' => $linkUrl,
            'poster_url' => $posterUrl === '' ? null : $posterUrl,
            'episodes' => $episodes,
        ])->toArray();
    }

    public function toggleLike(int $postId, int $userId): array
    {
        return $this->posts->toggleLike($postId, $userId);
    }

    public function saveReview(int $postId, int $userId, int $rating, ?string $review): array
    {
        if ($rating < 1 || $rating > 5) {
            throw new \InvalidArgumentException('La puntuación debe estar entre 1 y 5 estrellas.');
        }
        $reviewText = $review === null ? null : trim($review);
        if ($reviewText !== null && mb_strlen($reviewText) > 600) {
            throw new \InvalidArgumentException('La reseña no puede superar los 600 caracteres.');
        }

        return $this->posts->saveReview($postId, $userId, $rating, $reviewText);
    }

    public function reviews(int $postId): array
    {
        if ($postId < 1 || $this->posts->findById($postId) === null) {
            throw new \InvalidArgumentException('No se encontró la publicación.');
        }

        return $this->posts->reviewsForPost($postId);
    }

    public function registerView(int $postId): int
    {
        if ($postId < 1) {
            throw new \InvalidArgumentException('La publicación no es válida.');
        }

        return $this->posts->registerView($postId);
    }

    public function episodes(int $postId): array
    {
        if ($postId < 1 || $this->posts->findById($postId) === null) {
            throw new \InvalidArgumentException('No se encontró la publicación.');
        }

        return $this->posts->episodesForPost($postId);
    }

    private function validateEpisodes(string $type, mixed $input): array
    {
        if ($type !== 'series') {
            return [];
        }
        if (!is_array($input) || $input === [] || count($input) > 300) {
            throw new \InvalidArgumentException('Agregá al menos un episodio a la serie (máximo 300).');
        }

        $episodes = [];
        $seen = [];
        foreach ($input as $index => $episode) {
            if (!is_array($episode)) {
                throw new \InvalidArgumentException('Revisá los datos de cada episodio.');
            }

            $season = filter_var($episode['season_number'] ?? null, FILTER_VALIDATE_INT);
            $number = filter_var($episode['episode_number'] ?? null, FILTER_VALIDATE_INT);
            $title = trim((string) ($episode['title'] ?? ''));
            $linkUrl = trim((string) ($episode['link_url'] ?? ''));
            if ($season === false || $season < 1 || $season > 100 || $number === false || $number < 1 || $number > 1000) {
                throw new \InvalidArgumentException('Cada episodio debe tener temporada y número válidos.');
            }
            if (mb_strlen($title) > 120) {
                throw new \InvalidArgumentException('El título de episodio no puede superar los 120 caracteres.');
            }
            if (!$this->isHttpUrl($linkUrl)) {
                throw new \InvalidArgumentException('Cada episodio necesita un enlace externo válido (http o https).');
            }

            $key = $season . ':' . $number;
            if (isset($seen[$key])) {
                throw new \InvalidArgumentException('No puede repetirse un número de episodio dentro de la misma temporada.');
            }
            $seen[$key] = true;
            $episodes[] = [
                'season_number' => $season,
                'episode_number' => $number,
                'title' => $title === '' ? null : $title,
                'link_url' => $linkUrl,
            ];
        }

        usort($episodes, static fn (array $a, array $b): int =>
            [$a['season_number'], $a['episode_number']] <=> [$b['season_number'], $b['episode_number']]
        );

        return $episodes;
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
