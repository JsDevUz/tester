# Tashqi Caddy sayt konfiguratsiyalari

Production `.env` ichida `CADDY_SITES_DIR=/opt/caddy/sites` bo'ladi. Shu sabab
bu katalog tester Git repodan va uning deploylaridan mustaqil ishlaydi.

Yangi loyiha qo'shish uchun serverda `/opt/caddy/sites/loyiha.caddy` fayl yarating:

```caddyfile
loyiha.example.com {
    reverse_proxy host.docker.internal:3100
}
```

So'ng konfiguratsiyani tekshirib, uzilishsiz reload qiling:

```bash
cd /opt/tester
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Testerning asosiy `docker/Caddyfile` fayliga yangi loyiha domenlarini qo'shmang.
