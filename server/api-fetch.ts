/** External requests have no app deadline or Bun socket idle deadline.
 * Explicit caller cancellation is preserved. Resolve only on response/error.
 */
export type ApiRequestInit=RequestInit&{timeout?:number|boolean};
export function apiFetch(input:Parameters<typeof fetch>[0],init:ApiRequestInit={}){
 return fetch(input,{...init,timeout:false});
}
