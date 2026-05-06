FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace

ENV ANTHROPIC_API_KEY=""

CMD ["claude", "--dangerously-skip-permissions"]
