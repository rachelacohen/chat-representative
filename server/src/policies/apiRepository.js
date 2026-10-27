// Production policy source: the policy system's API, which the pilot does not have yet.
// It must expose the same methods as the CSV source and return the same shape - map each
// API record through normalizePolicy() (or an equivalent mapper) before returning it.
export function createApiRepository() {
  const notImplemented = async () => {
    throw new Error('POLICY_SOURCE=api is not implemented yet - the pilot reads the CSV export');
  };
  return {
    getPolicy: notImplemented,
    getCustomerPolicies: notImplemented,
    findByCustomerName: notImplemented,
    findByNameInText: notImplemented,
  };
}
