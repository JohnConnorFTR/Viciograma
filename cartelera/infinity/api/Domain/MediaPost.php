<?php
declare(strict_types=1);

namespace Cartelera\Domain;

final class MediaPost
{
    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly string $title,
        public readonly string $type,
        public readonly ?int $year,
        public readonly ?string $genre,
        public readonly ?string $description,
        public readonly string $linkUrl,
        public readonly ?string $posterUrl,
        public readonly string $createdAt,
        public readonly string $username
    ) {
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->userId,
            'title' => $this->title,
            'type' => $this->type,
            'year' => $this->year,
            'genre' => $this->genre,
            'description' => $this->description,
            'link_url' => $this->linkUrl,
            'poster_url' => $this->posterUrl,
            'created_at' => $this->createdAt,
            'username' => $this->username,
        ];
    }
}
