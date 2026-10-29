export async function fetchUser(id, { fetcher }) {
  return fetcher(`/users/${id}`);
}
