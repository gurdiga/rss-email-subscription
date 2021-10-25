export type CallRecordingFunction<F extends Function = Function> = F & {
  calls: any[][];
};

export function makeCallRecordingFunction<F extends Function>(): CallRecordingFunction<F> {
  const callRecordingFunction: any = (...args: any[]) => (callRecordingFunction.calls ||= []).push(args);

  return callRecordingFunction;
}
