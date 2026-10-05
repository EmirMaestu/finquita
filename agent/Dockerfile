# Contenedor para correr Claude Code sin supervisión sobre este repo.
# Usuario sin root (Claude Code no acepta --dangerously-skip-permissions como root),
# con el mismo UID que tu usuario del VPS para poder escribir en el repo montado.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=America/Argentina/Buenos_Aires

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl unzip ca-certificates ripgrep jq less procps postgresql-client tzdata \
  && rm -rf /var/lib/apt/lists/*

# Dependencias del sistema para el Chromium de Playwright.
# El navegador en sí lo descarga el proyecto (bunx playwright install chromium).
RUN npx -y playwright@latest install-deps chromium && rm -rf /var/lib/apt/lists/*

ARG HOST_UID=1000
ARG HOST_GID=1000
RUN groupmod -o -g "${HOST_GID}" node \
  && usermod -o -u "${HOST_UID}" -g "${HOST_GID}" node \
  && chown -R node:node /home/node

USER node
WORKDIR /home/node

# Bun y Claude Code (instalador nativo) para el usuario node.
RUN curl -fsSL https://bun.sh/install | bash \
  && curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/node/.bun/bin:/home/node/.local/bin:${PATH}"

RUN git config --global user.name "Claude Code (Mostrador)" \
  && git config --global user.email "claude-code@localhost" \
  && git config --global init.defaultBranch main \
  && git config --global --add safe.directory /workspace

WORKDIR /workspace
CMD ["sleep", "infinity"]
