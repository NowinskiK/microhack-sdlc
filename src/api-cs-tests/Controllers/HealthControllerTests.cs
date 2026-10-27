using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace OctoSupply.Api.Tests.Controllers;

public sealed class HealthControllerTests
{
    [Fact]
    public async Task HealthEndpointsReportProcessAndDatabaseReadinessAndAreDocumented()
    {
        await WithApiAsync(async client =>
        {
            var liveness = await client.GetAsync("/health/live");
            Assert.Equal(HttpStatusCode.OK, liveness.StatusCode);

            var readiness = await client.GetAsync("/health/ready");
            Assert.Equal(HttpStatusCode.OK, readiness.StatusCode);
            Assert.Equal("ready", (await readiness.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("status").GetString());

            var openApi = await client.GetFromJsonAsync<JsonElement>("/api-docs.json");
            var paths = openApi.GetProperty("paths");
            Assert.True(paths.TryGetProperty("/health/live", out _));
            Assert.True(paths.TryGetProperty("/health/ready", out var readinessPath));
            Assert.True(readinessPath.GetProperty("get").GetProperty("responses").TryGetProperty("503", out _));
        });
    }

    [Fact]
    public async Task ReadinessFailsWhenTheInitializedDatabaseIsUnavailableButLivenessRemainsHealthy()
    {
        await WithApiAsync(async client =>
        {
            var previousDbFile = Environment.GetEnvironmentVariable("DB_FILE");
            var unavailableDbDirectory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
            try
            {
                Environment.SetEnvironmentVariable(
                    "DB_FILE",
                    Path.Combine(unavailableDbDirectory, "uninitialized.db"));

                Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
                Assert.Equal(
                    HttpStatusCode.ServiceUnavailable,
                    (await client.GetAsync("/health/ready")).StatusCode);
            }
            finally
            {
                Environment.SetEnvironmentVariable("DB_FILE", previousDbFile);
                if (Directory.Exists(unavailableDbDirectory))
                {
                    Directory.Delete(unavailableDbDirectory, recursive: true);
                }
            }
        });
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void MissingOrEmptyMigrationsFailApplicationStartup(bool createMigrationsDirectory)
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"octosupply-api-tests-{Guid.NewGuid():N}.db");
        var migrationsDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        var previousDbFile = Environment.GetEnvironmentVariable("DB_FILE");
        var previousMigrationsDir = Environment.GetEnvironmentVariable("DB_MIGRATIONS_DIR");
        var previousSeedDir = Environment.GetEnvironmentVariable("DB_SEED_DIR");
        Environment.SetEnvironmentVariable("DB_FILE", dbPath);
        Environment.SetEnvironmentVariable("DB_MIGRATIONS_DIR", migrationsDir);
        Environment.SetEnvironmentVariable("DB_SEED_DIR", null);

        try
        {
            if (createMigrationsDirectory)
            {
                Directory.CreateDirectory(migrationsDir);
            }

            using var factory = new WebApplicationFactory<Program>();
            Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        }
        finally
        {
            Environment.SetEnvironmentVariable("DB_FILE", previousDbFile);
            Environment.SetEnvironmentVariable("DB_MIGRATIONS_DIR", previousMigrationsDir);
            Environment.SetEnvironmentVariable("DB_SEED_DIR", previousSeedDir);
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            if (Directory.Exists(migrationsDir))
            {
                Directory.Delete(migrationsDir, recursive: true);
            }
            if (File.Exists(dbPath))
            {
                File.Delete(dbPath);
            }
        }
    }

    private static async Task WithApiAsync(Func<HttpClient, Task> test)
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"octosupply-api-tests-{Guid.NewGuid():N}.db");
        var previousDbFile = Environment.GetEnvironmentVariable("DB_FILE");
        var previousMigrationsDir = Environment.GetEnvironmentVariable("DB_MIGRATIONS_DIR");
        var previousSeedDir = Environment.GetEnvironmentVariable("DB_SEED_DIR");
        var migrationsDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../database/migrations"));
        var seedDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../database/seed"));
        Environment.SetEnvironmentVariable("DB_FILE", dbPath);
        Environment.SetEnvironmentVariable("DB_MIGRATIONS_DIR", migrationsDir);
        Environment.SetEnvironmentVariable("DB_SEED_DIR", seedDir);

        try
        {
            using var factory = new WebApplicationFactory<Program>();
            using var client = factory.CreateClient();
            await test(client);
        }
        finally
        {
            Environment.SetEnvironmentVariable("DB_FILE", previousDbFile);
            Environment.SetEnvironmentVariable("DB_MIGRATIONS_DIR", previousMigrationsDir);
            Environment.SetEnvironmentVariable("DB_SEED_DIR", previousSeedDir);
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            if (File.Exists(dbPath))
            {
                File.Delete(dbPath);
            }
        }
    }
}
