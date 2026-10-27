using Microsoft.AspNetCore.Mvc;
using OctoSupply.Api.Models;
using OctoSupply.Api.Repositories;
using OctoSupply.Api.Utils;

namespace OctoSupply.Api.Controllers;

[ApiController]
[Route("api/orders")]
public sealed class OrdersController(OrdersRepository repository) : ControllerBase
{
    private readonly OrdersRepository _repository = repository;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<OrderHistory>>> GetAll([FromQuery] int? branchId)
    {
        if (!branchId.HasValue)
        {
            throw new ValidationException("branchId is required");
        }

        return Ok(await _repository.FindHistoryByBranchIdAsync(branchId.Value));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Order>> GetById(int id)
    {
        var item = await _repository.FindByIdAsync(id);
        return item is null ? throw new NotFoundException("Order", id) : Ok(item);
    }

    [HttpPost]
    public async Task<ActionResult<Order>> Create([FromBody] CreateOrderRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new ValidationException("name is required");
        }

        if (request.BranchId <= 0)
        {
            throw new ValidationException("branchId is required");
        }

        var created = await _repository.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = created.OrderId }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<Order>> Update(int id, [FromBody] UpdateOrderRequest request) =>
        Ok(await _repository.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _repository.DeleteAsync(id);
        return NoContent();
    }
}
