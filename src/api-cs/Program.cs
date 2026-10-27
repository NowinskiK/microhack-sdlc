using OctoSupply.Api.Data;
using OctoSupply.Api.Repositories;
using OctoSupply.Api.Utils;

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT") ?? "3000";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

builder.Services.AddSingleton<SqliteConnectionFactory>();
builder.Services.AddSingleton<DatabaseMigrator>();
builder.Services.AddScoped<BranchesRepository>();
builder.Services.AddScoped<DeliveriesRepository>();
builder.Services.AddScoped<HeadquartersRepository>();
builder.Services.AddScoped<OrderDetailDeliveriesRepository>();
builder.Services.AddScoped<OrderDetailsRepository>();
builder.Services.AddScoped<OrdersRepository>();
builder.Services.AddScoped<ProductsRepository>();
builder.Services.AddScoped<SuppliersRepository>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("ApiCors", policy =>
    {
        var configuredOrigins = Environment.GetEnvironmentVariable("API_CORS_ORIGINS");
        if (!string.IsNullOrWhiteSpace(configuredOrigins))
        {
            var origins = configuredOrigins
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
            return;
        }

        policy
            .SetIsOriginAllowed(origin =>
                origin.StartsWith("http://localhost:", StringComparison.OrdinalIgnoreCase) ||
                origin.StartsWith("http://127.0.0.1:", StringComparison.OrdinalIgnoreCase) ||
                origin.Contains(".app.github.dev", StringComparison.OrdinalIgnoreCase) ||
                origin.Contains(".azurecontainerapps.io", StringComparison.OrdinalIgnoreCase))
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.MapOpenApi("/api-docs.json");
app.UseCors("ApiCors");
app.UseMiddleware<ErrorHandlingMiddleware>();

app.MapGet("/", () => "Hello, world!");
app.MapGet("/health/live", () => Results.Ok(new { status = "ok" }))
    .WithSummary("Liveness check")
    .WithDescription("Confirms the API process is running. This check does not access the database.")
    .Produces(StatusCodes.Status200OK);
app.MapGet("/health/ready", async (DatabaseMigrator databaseMigrator) =>
    await databaseMigrator.IsReadyAsync()
        ? Results.Ok(new { status = "ready" })
        : Results.StatusCode(StatusCodes.Status503ServiceUnavailable))
    .WithSummary("Readiness check")
    .WithDescription("Confirms startup initialization completed and the SQLite database is accessible.")
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status503ServiceUnavailable);
app.MapControllers();

var migrator = app.Services.GetRequiredService<DatabaseMigrator>();
await migrator.InitializeAsync(seedOnStartup: true);

app.Run();

public partial class Program { }
