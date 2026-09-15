export const editorFeedbackEvent = 'makeine-editor-feedback';

export function notifyEditorSuccess(message: string) {
  window.dispatchEvent(new CustomEvent<string>(editorFeedbackEvent, { detail: message }));
}
