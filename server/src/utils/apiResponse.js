// Python original: app/schemas/response.py  (ApiResponse)
//
// Every /database/* route replies in this envelope:  { success, message, data }
export function apiResponse(success, message, data = null) {
  return { success, message, data };
}
