using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using OctoSupply.Api.Models;
using Xunit;

namespace OctoSupply.Api.Tests.Controllers;

public sealed class OrdersControllerTests
{
    [Fact]
    public async Task GetHistory_ValidUnknownAndEmptyBranchesHaveExpectedResponses()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"octosupply-api-tests-{Guid.NewGuid():N}.db");
        var previousDbFile = Environment.GetEnvironmentVariable("DB_FILE");
        var previousMigrationsDir = Environment.GetEnvironmentVariable("DB_MIGRATIONS_DIR");
        var migrationsDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../database/migrations"));
        Environment.SetEnvironmentVariable("DB_FILE", dbPath);
        Environment.SetEnvironmentVariable("DB_MIGRATIONS_DIR", migrationsDir);

        try
        {
            using var factory = new WebApplicationFactory<Program>();
            using var client = factory.CreateClient();
            await InsertTestDataAsync(dbPath);

            var openApi = await client.GetFromJsonAsync<JsonElement>("/api-docs.json");
            var historyOperation = openApi
                .GetProperty("paths")
                .GetProperty("/api/orders")
                .GetProperty("get");
            Assert.Contains(
                historyOperation.GetProperty("parameters").EnumerateArray(),
                parameter => parameter.GetProperty("name").GetString() == "branchId" &&
                             parameter.GetProperty("in").GetString() == "query");

            var response = await client.GetAsync("/api/orders?branchId=987650");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var history = await response.Content.ReadFromJsonAsync<List<OrderHistory>>();
            Assert.NotNull(history);
            Assert.Equal(2, history.Count);
            var orderWithItems = Assert.Single(history, order => order.OrderId == 987650);
            Assert.Equal(11, orderWithItems.Total);
            Assert.Collection(
                orderWithItems.LineItems,
                lineItem =>
                {
                    Assert.Equal("Integration Test Product", lineItem.ProductName);
                    Assert.Equal(2, lineItem.Quantity);
                    Assert.Equal(3.25, lineItem.UnitPrice);
                },
                lineItem =>
                {
                    Assert.Equal("Integration Test Product", lineItem.ProductName);
                    Assert.Equal(1, lineItem.Quantity);
                    Assert.Equal(4.5, lineItem.UnitPrice);
                });
            var orderWithoutItems = Assert.Single(history, order => order.OrderId == 987651);
            Assert.Empty(orderWithoutItems.LineItems);
            Assert.Equal(0, orderWithoutItems.Total);

            var emptyBranchResponse = await client.GetAsync("/api/orders?branchId=987651");
            Assert.Equal(HttpStatusCode.OK, emptyBranchResponse.StatusCode);
            Assert.Empty(await emptyBranchResponse.Content.ReadFromJsonAsync<List<OrderHistory>>() ?? []);

            var invalidBranchResponse = await client.GetAsync("/api/orders?branchId=987659");
            Assert.Equal(HttpStatusCode.NotFound, invalidBranchResponse.StatusCode);

            var missingBranchResponse = await client.GetAsync("/api/orders");
            Assert.Equal(HttpStatusCode.BadRequest, missingBranchResponse.StatusCode);
        }
        finally
        {
            Environment.SetEnvironmentVariable("DB_FILE", previousDbFile);
            Environment.SetEnvironmentVariable("DB_MIGRATIONS_DIR", previousMigrationsDir);
            if (File.Exists(dbPath))
            {
                File.Delete(dbPath);
            }
        }
    }

    [Theory]
    [InlineData("0", "VALIDATION_ERROR")]
    [InlineData("-5", "VALIDATION_ERROR")]
    [InlineData("", "VALIDATION_ERROR")]
    [InlineData("abc", null)]
    [InlineData("1.5", null)]
    [InlineData("99999999999", null)]
    public async Task GetHistory_InvalidBranchIdReturnsBadRequest(string branchId, string? expectedErrorCode)
    {
        await WithApiAsync(async (client, _) =>
        {
            var response = await client.GetAsync($"/api/orders?branchId={Uri.EscapeDataString(branchId)}");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            if (expectedErrorCode is not null)
            {
                var body = await response.Content.ReadFromJsonAsync<JsonElement>();
                Assert.Equal(expectedErrorCode, body.GetProperty("error").GetProperty("code").GetString());
            }
        });
    }

    [Fact]
    public async Task GetHistory_UnknownBranchReturnsNotFoundErrorPayload()
    {
        await WithApiAsync(async (client, _) =>
        {
            var response = await client.GetAsync("/api/orders?branchId=987659");

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("NOT_FOUND", body.GetProperty("error").GetProperty("code").GetString());
        });
    }

    [Fact]
    public async Task GetHistory_ReturnsCamelCaseJsonShapeExpectedByFrontend()
    {
        await WithApiAsync(async (client, dbPath) =>
        {
            await InsertTestDataAsync(dbPath);

            var history = await client.GetFromJsonAsync<JsonElement>("/api/orders?branchId=987650");

            var order = history.EnumerateArray().First();
            foreach (var property in new[] { "orderId", "branchId", "orderDate", "name", "status", "lineItems", "total" })
            {
                Assert.True(order.TryGetProperty(property, out _), $"Missing '{property}'");
            }
            var lineItem = order.GetProperty("lineItems").EnumerateArray().First();
            foreach (var property in new[] { "productId", "productName", "quantity", "unitPrice" })
            {
                Assert.True(lineItem.TryGetProperty(property, out _), $"Missing line item '{property}'");
            }
        });
    }

    [Fact]
    public async Task GetHistory_ReflectsOrderDeletedThroughApi()
    {
        await WithApiAsync(async (client, dbPath) =>
        {
            await InsertTestDataAsync(dbPath);

            var deleteResponse = await client.DeleteAsync("/api/orders/987650");
            Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

            var history = await client.GetFromJsonAsync<List<OrderHistory>>("/api/orders?branchId=987650");
            Assert.NotNull(history);
            Assert.Equal(987651, Assert.Single(history).OrderId);
        });
    }

    private static async Task WithApiAsync(Func<HttpClient, string, Task> test)
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"octosupply-api-tests-{Guid.NewGuid():N}.db");
        var previousDbFile = Environment.GetEnvironmentVariable("DB_FILE");
        var previousMigrationsDir = Environment.GetEnvironmentVariable("DB_MIGRATIONS_DIR");
        var migrationsDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../database/migrations"));
        Environment.SetEnvironmentVariable("DB_FILE", dbPath);
        Environment.SetEnvironmentVariable("DB_MIGRATIONS_DIR", migrationsDir);

        try
        {
            using var factory = new WebApplicationFactory<Program>();
            using var client = factory.CreateClient();
            await test(client, dbPath);
        }
        finally
        {
            Environment.SetEnvironmentVariable("DB_FILE", previousDbFile);
            Environment.SetEnvironmentVariable("DB_MIGRATIONS_DIR", previousMigrationsDir);
            SqliteConnection.ClearAllPools();
            if (File.Exists(dbPath))
            {
                File.Delete(dbPath);
            }
        }
    }

    private static async Task InsertTestDataAsync(string dbPath)
    {
        await using var connection = new SqliteConnection($"Data Source={dbPath}");
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO suppliers (supplier_id, name) VALUES (987650, 'Integration Test Supplier');
            INSERT INTO headquarters (headquarters_id, name) VALUES (987650, 'Integration Test HQ');
            INSERT INTO branches (branch_id, headquarters_id, name) VALUES
                (987650, 987650, 'Orders Branch'),
                (987651, 987650, 'Empty Branch');
            INSERT INTO products (product_id, supplier_id, name, price, sku, unit)
                VALUES (987650, 987650, 'Integration Test Product', 3.25, 'INT-987650', 'each');
            INSERT INTO orders (order_id, branch_id, order_date, name, status) VALUES
                (987650, 987650, '2026-10-27', 'Order with items', 'shipped'),
                (987651, 987650, '2026-10-26', 'Order without items', 'pending');
            INSERT INTO order_details (order_detail_id, order_id, product_id, quantity, unit_price) VALUES
                (987650, 987650, 987650, 2, 3.25),
                (987651, 987650, 987650, 1, 4.5);
            """;
        await command.ExecuteNonQueryAsync();
    }
}
