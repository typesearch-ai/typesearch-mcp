# The local typesearch MCP server (stdio) in a container, for the Docker MCP Catalog and Smithery.
#   docker build -t typesearch-mcp .
#   docker run -i --rm -e TYPESEARCH_API_KEY typesearch-mcp
#
# While package.json asks for typesearch-js by path (file:../typesearch-js, before the SDK is on npm), pass
# that folder, built, as a named context:
#   docker build --build-context typesearch-js=../typesearch-js -t typesearch-mcp .
# Otherwise this stage stays empty and npm installs typesearch-js from the registry.
FROM scratch AS typesearch-js

FROM node:22-alpine AS build
COPY --from=typesearch-js / /typesearch-js/
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# The build is a single file with no dependencies: the image only needs Node.
FROM node:22-alpine
LABEL org.opencontainers.image.title="typesearch-mcp" \
      org.opencontainers.image.description="MCP server for typesearch: news search for AI agents" \
      org.opencontainers.image.source="https://github.com/typesearch-ai/typesearch-mcp" \
      org.opencontainers.image.licenses="MIT" \
      io.modelcontextprotocol.server.name="ai.typesearch/news"
WORKDIR /app
COPY --from=build /src/dist/index.js ./index.mjs
USER node
ENTRYPOINT ["node", "/app/index.mjs"]
