# Copia de seguridad nocturna: pg_dump de la base y las fotos, cifrado con restic a un bucket externo.
#   docker build -f infra/backup/Dockerfile -t mostrador-backup .
FROM postgres:16-alpine
RUN apk add --no-cache restic curl tzdata
COPY infra/backup/backup.sh infra/backup/restore-test.sh /usr/local/bin/
COPY infra/backup/crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-test.sh
CMD ["crond", "-f", "-l", "8"]
