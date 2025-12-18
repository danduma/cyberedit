import { useCallback } from "react";

export function useDiffTransition(getView: () => any, options: any) {
    const showDiffTransition = useCallback((oldText: string, newText: string, range: any) => {
        // stub
    }, []);

    const clearDiffTransition = useCallback(() => {
        // stub
    }, []);

    return { showDiffTransition, clearDiffTransition };
}


