FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source

COPY src/api-cs/OctoSupply.Api.csproj src/api-cs/
RUN dotnet restore src/api-cs/OctoSupply.Api.csproj
COPY src/api-cs/ src/api-cs/
RUN dotnet publish src/api-cs/OctoSupply.Api.csproj --configuration Release --output /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app
COPY --from=build /app/publish .
COPY src/database/migrations/ /database/migrations/
COPY src/database/seed/ /database/seed/

ENV PORT=3000 \
    DB_FILE=/tmp/octosupply/app.db \
    DB_MIGRATIONS_DIR=/database/migrations \
    DB_SEED_DIR=/database/seed
EXPOSE 3000
USER $APP_UID
ENTRYPOINT ["dotnet", "OctoSupply.Api.dll"]
