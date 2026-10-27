namespace OctoSupply.Api.Models;

public sealed record OrderHistoryLineItem(
    int ProductId,
    string ProductName,
    int Quantity,
    double UnitPrice);

public sealed record OrderHistory(
    int OrderId,
    int BranchId,
    string OrderDate,
    string Name,
    string? Description,
    string Status,
    IReadOnlyList<OrderHistoryLineItem> LineItems,
    double Total);
