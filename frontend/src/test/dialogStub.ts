// jsdom에 없는 <dialog> 메서드를 얇게 채운다. 포커스 트랩·Esc·백드롭은 흉내 내지 않는다.
const opener = new WeakMap<HTMLDialogElement, Element | null>();

HTMLDialogElement.prototype.show = function () {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.showModal = function () {
  opener.set(this, document.activeElement);
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function (returnValue?: string) {
  if (!this.open) return;
  if (returnValue !== undefined) this.returnValue = returnValue;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
  (opener.get(this) as HTMLElement | null | undefined)?.focus?.();
  opener.delete(this);
};
