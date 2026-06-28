import { useEffect, useState } from "react";

import { globalApprovalManager, type ApprovalDecision, type ApprovalRequest } from "@/coding";

export function useApprovalManager() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    return globalApprovalManager.subscribe((req) => {
      // req will be null when queue is empty, or the next request object
      setRequest(req);
    });
  }, []);

  const respond = (decision: ApprovalDecision) => {
    if (request) {
      globalApprovalManager.respond(decision);
    }
  };

  return {
    approvalRequest: request,
    respondToApproval: respond,
  };
}
