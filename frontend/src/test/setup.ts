import '@testing-library/jest-dom'

// jsdom doesn't implement scrollIntoView — provide a no-op
window.HTMLElement.prototype.scrollIntoView = () => {}
