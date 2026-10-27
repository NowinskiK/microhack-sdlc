using Microsoft.Data.Sqlite;
using OctoSupply.Api.Data;
using OctoSupply.Api.Models;
using OctoSupply.Api.Utils;

namespace OctoSupply.Api.Repositories;

public sealed class OrdersRepository(SqliteConnectionFactory connectionFactory)
{
    private readonly SqliteConnectionFactory _connectionFactory = connectionFactory;

    public async Task<IReadOnlyList<Order>> FindAllAsync()
    {
        const string sql = "SELECT * FROM orders ORDER BY order_id;";
        await using var connection = await _connectionFactory.OpenConnectionAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        await using var reader = await cmd.ExecuteReaderAsync();
        var items = new List<Order>();
        while (await reader.ReadAsync())
        {
            items.Add(Map(reader));
        }
        return items;
    }

    public async Task<IReadOnlyList<OrderHistory>> FindHistoryByBranchIdAsync(int branchId)
    {
        if (branchId <= 0)
        {
            throw new ValidationException("branchId must be a positive integer");
        }

        await using var connection = await _connectionFactory.OpenConnectionAsync();
        await using (var branchCommand = connection.CreateCommand())
        {
            branchCommand.CommandText = "SELECT EXISTS (SELECT 1 FROM branches WHERE branch_id = $branchId);";
            branchCommand.Parameters.AddWithValue("$branchId", branchId);
            if (Convert.ToInt32(await branchCommand.ExecuteScalarAsync()) == 0)
            {
                throw new NotFoundException("Branch", branchId);
            }
        }

        const string sql = """
            SELECT o.order_id, o.branch_id, o.order_date, o.name, o.description, o.status,
                   od.order_detail_id, od.product_id, p.name AS product_name, od.quantity, od.unit_price
            FROM orders o
            LEFT JOIN order_details od ON od.order_id = o.order_id
            LEFT JOIN products p ON p.product_id = od.product_id
            WHERE o.branch_id = $branchId
            ORDER BY o.order_date DESC, o.order_id DESC, od.order_detail_id;
            """;

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$branchId", branchId);
        await using var reader = await cmd.ExecuteReaderAsync();

        var orders = new List<OrderHistoryBuilder>();
        var ordersById = new Dictionary<int, OrderHistoryBuilder>();
        while (await reader.ReadAsync())
        {
            var orderId = reader.GetInt32(reader.GetOrdinal("order_id"));
            if (!ordersById.TryGetValue(orderId, out var order))
            {
                order = new OrderHistoryBuilder(new Order(
                    OrderId: orderId,
                    BranchId: reader.GetInt32(reader.GetOrdinal("branch_id")),
                    OrderDate: reader.GetString(reader.GetOrdinal("order_date")),
                    Name: reader.GetString(reader.GetOrdinal("name")),
                    Description: reader["description"] as string,
                    Status: reader.GetString(reader.GetOrdinal("status"))));
                orders.Add(order);
                ordersById.Add(orderId, order);
            }

            if (!reader.IsDBNull(reader.GetOrdinal("order_detail_id")))
            {
                order.LineItems.Add(new OrderHistoryLineItem(
                    ProductId: reader.GetInt32(reader.GetOrdinal("product_id")),
                    ProductName: reader.GetString(reader.GetOrdinal("product_name")),
                    Quantity: reader.GetInt32(reader.GetOrdinal("quantity")),
                    UnitPrice: reader.GetDouble(reader.GetOrdinal("unit_price"))));
            }
        }

        return orders.Select(order => order.ToOrderHistory()).ToList();
    }

    public async Task<Order?> FindByIdAsync(int id)
    {
        const string sql = "SELECT * FROM orders WHERE order_id = $id;";
        await using var connection = await _connectionFactory.OpenConnectionAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? Map(reader) : null;
    }

    public async Task<Order> CreateAsync(CreateOrderRequest request)
    {
        const string sql = """
            INSERT INTO orders (branch_id, order_date, name, description, status)
            VALUES ($branchId, $orderDate, $name, $description, $status);
            SELECT last_insert_rowid();
            """;

        await using var connection = await _connectionFactory.OpenConnectionAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$branchId", request.BranchId);
        cmd.Parameters.AddWithValue("$orderDate", request.OrderDate);
        cmd.Parameters.AddWithValue("$name", request.Name);
        cmd.Parameters.AddWithValue("$description", (object?)request.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$status", request.Status);

        var id = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        return await FindByIdAsync(id) ?? throw new DatabaseException("Failed to retrieve created Order");
    }

    public async Task<Order> UpdateAsync(int id, UpdateOrderRequest request)
    {
        var updates = new List<string>();
        var parameters = new List<SqliteParameter>();
        if (request.BranchId.HasValue) { updates.Add("branch_id = $branchId"); parameters.Add(new SqliteParameter("$branchId", request.BranchId.Value)); }
        if (request.OrderDate is not null) { updates.Add("order_date = $orderDate"); parameters.Add(new SqliteParameter("$orderDate", request.OrderDate)); }
        if (request.Name is not null) { updates.Add("name = $name"); parameters.Add(new SqliteParameter("$name", request.Name)); }
        if (request.Description is not null) { updates.Add("description = $description"); parameters.Add(new SqliteParameter("$description", request.Description)); }
        if (request.Status is not null) { updates.Add("status = $status"); parameters.Add(new SqliteParameter("$status", request.Status)); }

        if (updates.Count == 0)
        {
            throw new ValidationException("No fields provided for update");
        }

        var sql = $"UPDATE orders SET {string.Join(", ", updates)} WHERE order_id = $id;";
        await using var connection = await _connectionFactory.OpenConnectionAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$id", id);
        foreach (var parameter in parameters)
        {
            cmd.Parameters.Add(parameter);
        }
        var changes = await cmd.ExecuteNonQueryAsync();
        if (changes == 0)
        {
            throw new NotFoundException("Order", id);
        }

        return await FindByIdAsync(id) ?? throw new DatabaseException("Failed to retrieve updated Order");
    }

    public async Task DeleteAsync(int id)
    {
        const string sql = "DELETE FROM orders WHERE order_id = $id;";
        await using var connection = await _connectionFactory.OpenConnectionAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$id", id);
        var changes = await cmd.ExecuteNonQueryAsync();
        if (changes == 0)
        {
            throw new NotFoundException("Order", id);
        }
    }

    private static Order Map(SqliteDataReader reader) =>
        new(
            OrderId: reader.GetInt32(reader.GetOrdinal("order_id")),
            BranchId: reader.GetInt32(reader.GetOrdinal("branch_id")),
            OrderDate: reader.GetString(reader.GetOrdinal("order_date")),
            Name: reader.GetString(reader.GetOrdinal("name")),
            Description: reader["description"] as string,
            Status: reader.GetString(reader.GetOrdinal("status"))
        );

    private sealed class OrderHistoryBuilder(Order order)
    {
        public List<OrderHistoryLineItem> LineItems { get; } = [];

        public OrderHistory ToOrderHistory() =>
            new(
                OrderId: order.OrderId,
                BranchId: order.BranchId,
                OrderDate: order.OrderDate,
                Name: order.Name,
                Description: order.Description,
                Status: order.Status,
                LineItems: LineItems,
                Total: LineItems.Sum(item => item.Quantity * item.UnitPrice));
    }
}
