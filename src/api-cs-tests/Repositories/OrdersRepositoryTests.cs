using Microsoft.Extensions.Logging.Abstractions;
using OctoSupply.Api.Data;
using OctoSupply.Api.Repositories;
using OctoSupply.Api.Utils;
using Xunit;

namespace OctoSupply.Api.Tests.Repositories;

public sealed class OrdersRepositoryTests
{
    [Fact]
    public async Task FindHistoryByBranchId_ReturnsOnlyBranchOrdersWithDetailsAndTotals()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"octosupply-tests-{Guid.NewGuid():N}.db");
        var previousDbFile = Environment.GetEnvironmentVariable("DB_FILE");
        Environment.SetEnvironmentVariable("DB_FILE", dbPath);

        try
        {
            var factory = new SqliteConnectionFactory(new NullLogger<SqliteConnectionFactory>());
            await EnsureSchemaAndDataAsync(factory);
            var repository = new OrdersRepository(factory);

            var history = await repository.FindHistoryByBranchIdAsync(1);

            var orderWithDetails = Assert.Single(history, order => order.OrderId == 10);
            Assert.Equal("shipped", orderWithDetails.Status);
            Assert.Equal(11, orderWithDetails.Total);
            Assert.Collection(
                orderWithDetails.LineItems,
                item =>
                {
                    Assert.Equal(100, item.ProductId);
                    Assert.Equal("Test Product", item.ProductName);
                    Assert.Equal(2, item.Quantity);
                    Assert.Equal(3.25, item.UnitPrice);
                },
                item =>
                {
                    Assert.Equal(100, item.ProductId);
                    Assert.Equal("Test Product", item.ProductName);
                    Assert.Equal(1, item.Quantity);
                    Assert.Equal(4.5, item.UnitPrice);
                });

            var orderWithoutDetails = Assert.Single(history, order => order.OrderId == 11);
            Assert.Empty(orderWithoutDetails.LineItems);
            Assert.Equal(0, orderWithoutDetails.Total);
            Assert.DoesNotContain(history, order => order.OrderId == 12);
        }
        finally
        {
            Environment.SetEnvironmentVariable("DB_FILE", previousDbFile);
            if (File.Exists(dbPath))
            {
                File.Delete(dbPath);
            }
        }
    }

    [Fact]
    public async Task FindHistoryByBranchId_RejectsUnknownBranch()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"octosupply-tests-{Guid.NewGuid():N}.db");
        var previousDbFile = Environment.GetEnvironmentVariable("DB_FILE");
        Environment.SetEnvironmentVariable("DB_FILE", dbPath);

        try
        {
            var factory = new SqliteConnectionFactory(new NullLogger<SqliteConnectionFactory>());
            await EnsureSchemaAndDataAsync(factory);

            await Assert.ThrowsAsync<NotFoundException>(() =>
                new OrdersRepository(factory).FindHistoryByBranchIdAsync(999));
        }
        finally
        {
            Environment.SetEnvironmentVariable("DB_FILE", previousDbFile);
            if (File.Exists(dbPath))
            {
                File.Delete(dbPath);
            }
        }
    }

    private static async Task EnsureSchemaAndDataAsync(SqliteConnectionFactory connectionFactory)
    {
        await using var connection = await connectionFactory.OpenConnectionAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE branches (branch_id INTEGER PRIMARY KEY);
            CREATE TABLE products (product_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE orders (
                order_id INTEGER PRIMARY KEY,
                branch_id INTEGER NOT NULL,
                order_date TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL
            );
            CREATE TABLE order_details (
                order_detail_id INTEGER PRIMARY KEY,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price REAL NOT NULL
            );
            INSERT INTO branches VALUES (1), (2);
            INSERT INTO products VALUES (100, 'Test Product');
            INSERT INTO orders VALUES
                (10, 1, '2026-01-02', 'Order with items', NULL, 'shipped'),
                (11, 1, '2026-01-01', 'Order without items', NULL, 'pending'),
                (12, 2, '2026-01-03', 'Other branch order', NULL, 'pending');
            INSERT INTO order_details VALUES
                (1000, 10, 100, 2, 3.25),
                (1001, 10, 100, 1, 4.5);
            """;
        await cmd.ExecuteNonQueryAsync();
    }
}
