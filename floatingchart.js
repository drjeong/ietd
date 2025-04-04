// Base FloatingChart class
class FloatingChart {
    constructor(containerId) {
        this.containerId = containerId;
        this.initializeFloatingFeatures();
    }

    initializeFloatingFeatures() {
        this.addStyles();
        this.createModalElements();
        this.addFloatingButton();
    }

    addStyles() {
        // Check if styles already exist
        if (!document.getElementById('floating-chart-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'floating-chart-styles';
            styleSheet.textContent = `
                .float-button {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    padding: 5px 10px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    z-index: 100;
                }

                .float-button:hover {
                    background-color: #45a049;
                }

                .modal-overlay {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    z-index: 1000;
                }

                .modal-dialog {
                    display: none;
                    position: fixed;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                    min-width: 300px;
                    min-height: 200px;
                    resize: both;
                    overflow: auto;
                    z-index: 1001;
                }

                .modal-header {
                    padding: 10px;
                    background-color: #f5f5f5;
                    border-bottom: 1px solid #ddd;
                    cursor: move;
                    border-radius: 8px 8px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .modal-close {
                    cursor: pointer;
                    padding: 5px;
                    font-size: 18px;
                }

                .modal-content {
                    padding: 15px;
                    height: calc(100% - 40px);
                }
            `;
            document.head.appendChild(styleSheet);
        }
    }

    createModalElements() {
        // Create modal elements if they don't exist
        if (!document.getElementById(`modal-${this.containerId}`)) {
            const modal = d3.select("body")
                .append("div")
                .attr("class", "modal-overlay")
                .attr("id", `modal-${this.containerId}`);

            const dialog = modal.append("div")
                .attr("class", "modal-dialog")
                .style("width", "800px")
                .style("height", "600px");

            const header = dialog.append("div")
                .attr("class", "modal-header");

            header.append("span")
                .text("Chart View");

            header.append("span")
                .attr("class", "modal-close")
                .html("&times;");

            const content = dialog.append("div")
                .attr("class", "modal-content")
                .append("div")
                .attr("id", `floating-${this.containerId}`);

            this.modal = modal;
            this.dialog = dialog;
            this.floatingContainer = d3.select(`#floating-${this.containerId}`);

            // Add event listeners
            modal.select(".modal-close").on("click", () => this.hideFloatingChart());
            modal.on("click", (event) => {
                if (event.target === modal.node()) {
                    this.hideFloatingChart();
                }
            });

            // Make dialog draggable
            this.makeDraggable(dialog.node(), header.node());
        }
    }

    addFloatingButton() {
        // Add button to chart container
        const button = d3.select(`#${this.containerId}`)
            .append("button")
            .attr("class", "float-button")
            .text("Float Chart");

        button.on("click", () => this.showFloatingChart());
    }

    showFloatingChart() {
        // Store original container and dimensions
        this.originalContainer = d3.select(`#${this.containerId}`);
        this.originalWidth = this.width;
        this.originalHeight = this.height;

        // Show modal and dialog
        this.modal.style("display", "block");
        this.dialog.style("display", "block");

        // Position dialog in center
        const dialogRect = this.dialog.node().getBoundingClientRect();
        this.dialog
            .style("left", `${(window.innerWidth - dialogRect.width) / 2}px`)
            .style("top", `${(window.innerHeight - dialogRect.height) / 2}px`);

        // Move chart to floating container
        this.moveChartToFloat();

        // Add resize observer
        if (!this.resizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.handleResize();
            });
            this.resizeObserver.observe(this.floatingContainer.node());
        }
    }

    hideFloatingChart() {
        // Move chart back to original container
        this.moveChartToOriginal();

        this.modal.style("display", "none");
        this.dialog.style("display", "none");

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    moveChartToFloat() {
        const containerRect = this.floatingContainer.node().getBoundingClientRect();

        // Update dimensions
        this.width = containerRect.width;
        this.height = containerRect.height;

        // Move SVG to floating container
        const svg = this.originalContainer.select('svg');
        this.floatingContainer.node().appendChild(svg.node());

        // Update chart with new dimensions
        this.updateDimensions(this.width, this.height);
    }

    moveChartToOriginal() {
        // Move SVG back to original container
        const svg = this.floatingContainer.select('svg');
        this.originalContainer.node().appendChild(svg.node());

        // Restore original dimensions
        this.width = this.originalWidth;
        this.height = this.originalHeight;
        this.updateDimensions(this.width, this.height);
    }

    handleResize() {
        const containerRect = this.floatingContainer.node().getBoundingClientRect();
        this.width = containerRect.width;
        this.height = containerRect.height;
        this.updateDimensions(this.width, this.height);
    }

    // This method should be implemented by child classes
    updateDimensions(width, height) {
        console.warn('updateDimensions method should be implemented by child class');
    }

    makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        const dragMouseDown = (e) => {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        const elementDrag = (e) => {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        };

        const closeDragElement = () => {
            document.onmouseup = null;
            document.onmousemove = null;
        };

        handle.onmousedown = dragMouseDown;
    }

    destroy() {
        // Clean up resources
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.modal?.remove();
        d3.select(`#${this.containerId}`).select(".float-button").remove();
    }
}
