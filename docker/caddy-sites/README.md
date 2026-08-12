# Tashqi Caddy sayt konfiguratsiyalari

Production gateway `/opt/caddy` ichida alohida Docker Compose loyiha sifatida
ishlaydi. Shu sabab Caddy va bu katalog tester deploylaridan mustaqil.

Yangi loyiha qo'shish uchun serverda `/opt/caddy/sites/loyiha.caddy` fayl yarating:

```caddyfile
loyiha.example.com {
    reverse_proxy host.docker.internal:3100
}
```

So'ng konfiguratsiyani tekshirib, uzilishsiz reload qiling:

```bash
cd /opt/caddy
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Testerning asosiy `docker/Caddyfile` fayliga yangi loyiha domenlarini qo'shmang.
