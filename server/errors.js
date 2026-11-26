export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function databaseError(error) {
  if (error.message==='bulk_ineligible') return new HttpError(409,error.message);
  if (['promotion_conflict','promotion_locked','promotion_ineligible'].includes(error.message)) return new HttpError(409,error.message);
  if (['delivery_unavailable','stock_unavailable','quote_changed','invalid_transition','inventory_changed','archive_required','product_has_history','duplicate_slug','unresolved_prices','delivery_locked'].includes(error.message)) {
    return new HttpError(409, error.message);
  }
  if (error.code === 'P0002') return new HttpError(404, 'not_found');
  if (error.code === '23503') return new HttpError(400, 'invalid_input');
  return error;
}
