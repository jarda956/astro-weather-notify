# Astro Weather Notify

Webová aplikace pro sledování předpovědi počasí v lokalitách, kde se dělá
astrofotografie. Pro každou uloženou lokalitu ukazuje předpověď oblačnosti a
srážek **na noc** (od západu do východu slunce) a umí poslat Telegram
notifikaci vybraným lidem ze skupiny, když se blíží jasná noc.

## Funkce

- Přihlášení, více uživatelských účtů (první účet se založí při prvním
  spuštění, další přidává administrátor v Nastavení).
- Uložené lokality s GPS souřadnicemi, přidání ručně nebo výběrem místa na
  mapě.
- Předpověď ze dvou nezávislých modelů:
  - **ICON-D2** (DWD, ~2 km rozlišení, Střední Evropa)
  - **HARMONIE-AROME** (KNMI, ~2 km, celoevropská doména)

  > Model **ALADIN** (dřív používaný ČHMÚ) bohužel nemá žádné veřejné/free
  > API. HARMONIE-AROME je nejbližší dostupná náhrada srovnatelného
  > rozlišení a pokrývá celé Česko i Slovensko — oba modely a jejich
  > konzistenci (shodu) lze v kartě lokality porovnat.
- Automatická notifikace přes Telegram, když predikovaná oblačnost a srážky
  pro nadcházející noc klesnou pod nastavený práh (výchozí: oblačnost ≤ 30 %,
  pravděpodobnost srážek ≤ 20 %) — kontroluje se v posledních hodinách před
  západem slunce, notifikace se pro danou noc a lokalitu pošle jen jednou.
- U každé lokality lze zvlášť nastavit, kterým členům skupiny se mají
  notifikace pro ni posílat (ne každý jezdí všude).
- WhatsApp notifikace nejsou (zatím) implementované — vyžadují placený
  WhatsApp Business/Twilio účet. Pokud je budeš chtít doplnit, ozvi se.

## Technologie

- Backend: Node.js + Express + TypeScript, SQLite (soubor na disku, žádná
  externí databáze).
- Frontend: React + Vite + TypeScript, mapa přes Leaflet/OpenStreetMap.
- Předpověď: [Open-Meteo](https://open-meteo.com/) (zdarma, bez API klíče).
- Notifikace: Telegram Bot API.

## Instalace na Proxmox (LXC kontejner)

1. Vytvoř nový LXC kontejner (Debian 12 nebo Ubuntu 22.04+ šablona).
2. Pokud chceš použít Docker (doporučeno), kontejner musí mít povolené
   nesting a keyctl. Na Proxmox hostu:
   ```bash
   pct set <CTID> --features nesting=1,keyctl=1
   pct reboot <CTID>
   ```
3. Uvnitř kontejneru spusť instalační skript, který nainstaluje Docker,
   naklonuje repozitář a app spustí:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/jarda956/astro-weather-notify/main/install.sh | bash
   ```
   Skript vytvoří `.env` s náhodným `JWT_SECRET`. Pokud chceš rovnou zapnout
   Telegram notifikace, uprav `/opt/astro-weather-notify/.env` (viz níže) a
   spusť znovu `docker compose up -d --build` v tomto adresáři.
4. Aplikace poběží na `http://<IP-kontejneru>:3000`. Pro přístup zvenku
   doporučujeme před ni dát reverzní proxy (nginx/Caddy) s HTTPS.

### Ruční instalace (Docker Compose)

```bash
git clone https://github.com/jarda956/astro-weather-notify.git
cd astro-weather-notify
cp .env.example .env
# uprav .env (JWT_SECRET, případně TELEGRAM_BOT_TOKEN)
docker compose up -d --build
```

### Instalace bez Dockeru (přímo na LXC)

```bash
git clone https://github.com/jarda956/astro-weather-notify.git /opt/astro-weather-notify
cd /opt/astro-weather-notify
cp .env.example .env   # a uprav hodnoty

cd server && npm install && npm run build && cd ..
cd web && npm install && npm run build && cd ..   # vygeneruje server/public

useradd -r -s /usr/sbin/nologin astro-weather || true
chown -R astro-weather:astro-weather /opt/astro-weather-notify

cp deploy/astro-weather.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now astro-weather
```

## Proměnné prostředí (`.env`)

| Proměnná | Popis |
|---|---|
| `PORT` | Port serveru (výchozí 3000) |
| `JWT_SECRET` | Tajný klíč pro přihlašovací session, vygeneruj např. `openssl rand -hex 32` |
| `DATABASE_PATH` | Cesta k SQLite souboru |
| `TELEGRAM_BOT_TOKEN` | Token bota od [@BotFather](https://t.me/BotFather); prázdné = Telegram notifikace vypnuté |
| `NOTIFY_CRON` | Jak často se kontroluje předpověď (cron výraz, výchozí každou hodinu) |
| `NOTIFY_LOOKAHEAD_HOURS` | Kolik hodin před západem slunce smí přijít notifikace na danou noc |

## Nastavení Telegram bota

1. V Telegramu napiš [@BotFather](https://t.me/BotFather), vytvoř bota
   příkazem `/newbot`, zkopíruj token do `TELEGRAM_BOT_TOKEN` v `.env` a
   restartuj aplikaci.
2. Každý uživatel si v aplikaci v Nastavení klikne na "Propojit Telegram",
   otevře vygenerovaný odkaz a v Telegramu stiskne Start — tím se jeho účet
   propojí a bude moct dostávat notifikace.

## Vývoj

```bash
cd server && npm install && npm run dev   # backend na :3000
cd web && npm install && npm run dev      # frontend na :5173, proxíruje /api na :3000
```
