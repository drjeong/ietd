class MonthlyDistribution extends ChartCommons {
    constructor(containerId, IETDhour, IETDData) {
        super(containerId);

        this.containerId = containerId;
        this.IETDhour = IETDhour;
        this.IETDData = IETDData;
        this.margin = { top: 20, right: 20, bottom: 50, left: 60 };
        this.title = "Monthly Precipitation Distribution";

        // Configuration
        this.colors = {
            Winter: '#0099cc',
            Spring: '#66cc33',
            Summer: '#ff9933',
            Fall: '#cc6633'
        };

        this.monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Bind methods
        this.resize = this.resize.bind(this);
        this.processData = this.processData.bind(this);

        // Initialize
        this.processData();
        this.initialize();

        // Add the hide button last
        // this.createHideButton();
    }

    initialize() {
        const container = d3.select(`#${this.containerId}`);
        this.width = parseInt(container.style('width'));
        this.height = parseInt(container.style('height'));
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        // Create year selector
        this.createYearSelector();

        this.createSvg();
        this.createScales();
        this.createAxes();
        this.createVisualization();

        window.addEventListener('resize', this.resize);
    }

    getAvailableYears() {
        const years = new Set();

        // Get years from both datasets and convert to strings
        this.IETDData.forEach(d => {
            const year = new Date(d[0]).getFullYear().toString();
            years.add(year);
        });

        return ['all', ...Array.from(years).sort()];
    }

    createYearSelector() {
        const selectorContainer = d3.select(`#${this.containerId}`)
            .append("div")
            .attr("class", "year-selector-container")  // Add a class for easy selection
            .style("position", "absolute")
            .style("top", "-5px")
            .style("right", "20px");

        const select = selectorContainer
            .append("select")
            .attr("class", "year-selector")  // Add a class for easy selection
            .style("padding", "2px 2px")
            .style("font-family", "Arial")
            .style("font-size", "10px")
            .on("change", (event) => {
                this.selectedYear = event.target.value;
                this.processData();
                this.updateVisualization();
            });

        this.updateYearSelector(); // Initial population of options
    }

    updateVisualization() {
        // Update scales
        this.createScales();

        // Update the chart
        this.updateData(this.IETDData, this.IETDhour);

        // Update title to show selected year
        this.svg.select(".title.monthly")
            .text(`Monthly Average Precipitation ${this.selectedYear === 'all' ? '' : `(${this.selectedYear})`}`);
    }

    updateYearSelector() {
        const select = d3.select(`#${this.containerId}`)
            .select(".year-selector");

        // Get current selection
        const currentValue = select.property("value");

        // Get new years
        const years = this.getAvailableYears();

        // Update options
        const options = select.selectAll("option")
            .data(years);

        // Remove old options
        options.exit().remove();

        // Update existing options
        options
            .attr("value", d => d)
            .text(d => d === 'all' ? 'All Years' : d);

        // Add new options
        options.enter()
            .append("option")
            .attr("value", d => d)
            .text(d => d === 'all' ? 'All Years' : d);

        // If current selection is no longer valid, reset to 'all' and update visualization
        if (!years.includes(currentValue)) {
            select.property("value", 'all');
            this.selectedYear = 'all';
            // Trigger data processing and visualization update
            this.processData();
        } else {
            select.property("value", currentValue);
        }
    }


    createSvg() {
        d3.select(`#${this.containerId}`).select("svg").remove();

        this.svg = d3.select(`#${this.containerId}`)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height);

        this.tooltip = d3.select("body")
            .append("div")
            .style("position", "absolute")
            .style("z-index", "999999")
            .style("visibility", "hidden")
            .attr("font-family", "Arial")
            .style('font-size', '11px')
            .style('color', 'black');
    }

    processData() {
        if (!Array.isArray(this.IETDData) || this.IETDData.length === 0) {
            console.error('Invalid or empty IETDData');
            return;
        }

        try {
            // Filter data by selected year if it's not 'all'
            let filteredData = this.IETDData;
            if (this.selectedYear && this.selectedYear !== 'all') {
                filteredData = this.IETDData.filter(d => {
                    const year = new Date(d[0]).getFullYear().toString();
                    return year === this.selectedYear;
                });
            }

            // Group data by month
            const monthlyData = d3.group(filteredData, d => new Date(d[0]).getMonth());

            this.formattedData = Array.from(monthlyData, ([month, values]) => {
                const volumes = values.map(d => d[2]);
                return {
                    month: +month,
                    quartiles: d3.quantile(volumes.sort(d3.ascending), 0.25),
                    median: d3.median(volumes),
                    q3: d3.quantile(volumes.sort(d3.ascending), 0.75),
                    iqr: d3.quantile(volumes.sort(d3.ascending), 0.75) - d3.quantile(volumes.sort(d3.ascending), 0.25),
                    min: d3.min(volumes),
                    max: d3.max(volumes),
                    season: this.getSeasonFromMonth(+month)
                };
            });

            // Ensure all months are represented, even if there's no data
            const allMonths = Array.from({length: 12}, (_, i) => i);
            const existingMonths = new Set(this.formattedData.map(d => d.month));

            allMonths.forEach(month => {
                if (!existingMonths.has(month)) {
                    this.formattedData.push({
                        month: month,
                        quartiles: 0,
                        median: 0,
                        q3: 0,
                        iqr: 0,
                        min: 0,
                        max: 0,
                        season: this.getSeasonFromMonth(month)
                    });
                }
            });

            // Sort by month
            this.formattedData.sort((a, b) => a.month - b.month);

        } catch (error) {
            console.error('Error processing data:', error);
            return null;
        }
    }

    getSeasonFromMonth(month) {
        if (month >= 2 && month <= 4) return 'Spring';
        if (month >= 5 && month <= 7) return 'Summer';
        if (month >= 8 && month <= 10) return 'Fall';
        return 'Winter';
    }

    createScales() {
        this.xScale = d3.scaleBand()
            .domain(d3.range(12))
            .range([0, this.innerWidth])
            .padding(0.1);

        const maxValue = d3.max(this.formattedData, d => d.max);
        this.yScale = d3.scaleSymlog()
            .domain([0, maxValue * 1.1])
            .range([this.innerHeight, 0])
            .constant(0.1);
    }

    createAxes() {
        const xAxis = d3.axisBottom(this.xScale)
            .tickFormat((d, i) => this.monthNames[i]);

        this.xAxis = this.svg.append("g")
            .attr("class", "x axis")
            .attr("color", "black")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top + this.innerHeight})`)
            .call(xAxis);

        const yAxis = d3.axisLeft(this.yScale)
            .tickFormat(d => d.toFixed(2));

        this.yAxis = this.svg.append("g")
            .attr("class", "y axis")
            .attr("color", "black")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`)
            .call(yAxis);

        this.dedupeYAxisLabels(this.svg.select(".y.axis").selectAll(".tick text"));
    }

    createVisualization() {
        // Create box plots
        const boxWidth = this.xScale.bandwidth();

        const boxPlots = this.svg.selectAll(".boxplot")
            .data(this.formattedData)
            .enter()
            .append("g")
            .attr("class", "boxplot")
            .attr("transform", d => `translate(${this.margin.left + this.xScale(d.month)},${this.margin.top})`);

        // Draw boxes
        boxPlots.append("rect")
            .attr("y", d => this.yScale(d.q3))
            .attr("height", d => this.yScale(d.quartiles) - this.yScale(d.q3))
            .attr("width", boxWidth)
            .attr("fill", d => this.colors[d.season])
            .attr("stroke", "black");

        // Draw median lines
        boxPlots.append("line")
            .attr("y1", d => this.yScale(d.median))
            .attr("y2", d => this.yScale(d.median))
            .attr("x1", 0)
            .attr("x2", boxWidth)
            .attr("stroke", "black")
            .attr("stroke-width", 2);

        // Draw whiskers
        boxPlots.append("line")
            .attr("class", "whisker")
            .attr("y1", d => this.yScale(d.min))
            .attr("y2", d => this.yScale(d.max))
            .attr("x1", boxWidth / 2)
            .attr("x2", boxWidth / 2)
            .attr("stroke", "black");

        // Add whisker caps
        boxPlots.append("line")
            .attr("class", "whisker-cap")
            .attr("y1", d => this.yScale(d.min))
            .attr("y2", d => this.yScale(d.min))
            .attr("x1", boxWidth * 0.25)
            .attr("x2", boxWidth * 0.75)
            .attr("stroke", "black");

        boxPlots.append("line")
            .attr("class", "whisker-cap")
            .attr("y1", d => this.yScale(d.max))
            .attr("y2", d => this.yScale(d.max))
            .attr("x1", boxWidth * 0.25)
            .attr("x2", boxWidth * 0.75)
            .attr("stroke", "black");

        this.createTitles();
        this.createSeasonalLegend();

        // Add hover effects and tooltips
        boxPlots
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));
    }

    createTitles() {
        this.chartTitle = this.svg.append("text")
            .attr("class", "title")
            .attr("x", this.margin.left + this.innerWidth/2)
            .attr("y", 15)
            .attr('text-anchor', 'middle')
            .attr("font-family", "Arial")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text(this.title);

        // Y-axis label
        this.svg.append('g')
            .attr('transform', `translate(${this.margin.left * 1/5}, ${this.innerHeight/2})`)
            .append('text')
            .attr('text-anchor', 'middle')
            .attr('transform', 'rotate(-90)')
            .attr("font-size", "12px")
            .text('HPCP (inch)')
            .attr("font-family", "Arial");
    }

    createSeasonalLegend() {
        const legendSpacing = 80;
        const legendY = this.height - 20;
        const seasons = ['Winter', 'Spring', 'Summer', 'Fall'];
        const totalLegendWidth = seasons.length * legendSpacing;
        const legendStartX = this.margin.left + (this.innerWidth - totalLegendWidth) / 2;

        const legend = this.svg.append("g")
            .attr("class", "season-legend")
            .attr("transform", `translate(${legendStartX}, ${legendY})`);

        seasons.forEach((season, i) => {
            const group = legend.append("g")
                .attr("transform", `translate(${i * legendSpacing}, 0)`);

            group.append("rect")
                .attr("width", 6)
                .attr("height", 6)
                .attr("fill", this.colors[season])
                .attr("stroke", "black");

            group.append("text")
                .attr("x", 15)
                .attr("y", 6)
                .attr("font-size", "10px")
                .style("alignment-baseline", "middle")
                .text(season);
        });
    }

    handleMouseOver(event, d) {
        this.tooltip
            .html(this.createTooltipFormat(d, `
                Month: ${this.monthNames[d.month]}<br/>
                Maximum: ${d.max.toFixed(2)}<br/>
                75th percentile: ${d.q3.toFixed(2)}<br/>
                Median: ${d.median.toFixed(2)}<br/>
                25th percentile: ${d.quartiles.toFixed(2)}<br/>
                Minimum: ${d.min.toFixed(2)}<br/>
                Season: ${d.season}
            `))
            .style("visibility", "visible")
            .style("top", (event.pageY - 10) + "px")
            .style("left", (event.pageX + 10) + "px");
    }

    handleMouseOut(event, d) {
        this.tooltip.style("visibility", "hidden");
    }

    dedupeYAxisLabels(labels) {
        const labelData = [];
        labels.each(function(d, i) {
            const bbox = this.getBoundingClientRect();
            labelData.push({
                index: i,
                top: bbox.top,
                bottom: bbox.bottom,
                height: bbox.height,
                element: this,
                value: d
            });
        });

        labelData.sort((a, b) => a.top - b.top);
        const buffer = 2;

        let lastVisibleLabel = labelData[0];
        d3.select(lastVisibleLabel.element).style("opacity", 1);

        for (let i = 1; i < labelData.length; i++) {
            const currentLabel = labelData[i];
            if (lastVisibleLabel.bottom + buffer > currentLabel.top) {
                d3.select(currentLabel.element).style("opacity", 0);
            } else {
                d3.select(currentLabel.element).style("opacity", 1);
                lastVisibleLabel = currentLabel;
            }
        }
    }

    resize() {
        if (!this.isVisible()) return;

        const container = d3.select(`#${this.containerId}`);
        this.width = parseInt(container.style('width'));
        this.innerWidth = this.width - this.margin.left - this.margin.right;

        this.svg.attr("width", this.width);
        this.xScale.range([0, this.innerWidth]);

        this.updateAxes();
        this.updateBoxPlots();

        this.chartTitle.attr("x", this.margin.left + this.innerWidth/2);
        this.updateLegend();

        // ... your existing resize code ...
        // this.updateHideButtonPosition();
    }

    updateBoxPlots() {
        const boxWidth = this.xScale.bandwidth();

        this.svg.selectAll(".boxplot")
            .attr("transform", d => `translate(${this.margin.left + this.xScale(d.month)},${this.margin.top})`);

        this.svg.selectAll(".boxplot rect")
            .attr("width", boxWidth);

        this.svg.selectAll(".boxplot line")
            .attr("x2", boxWidth);

        this.svg.selectAll(".whisker")
            .attr("x1", boxWidth / 2)
            .attr("x2", boxWidth / 2);

        this.svg.selectAll(".whisker-cap")
            .attr("x1", boxWidth * 0.25)
            .attr("x2", boxWidth * 0.75);
    }

    updateLegend() {
        const legendSpacing = 80;
        const legendY = this.height - 20;
        const totalLegendWidth = 4 * legendSpacing;
        const legendStartX = this.margin.left + (this.innerWidth - totalLegendWidth) / 2;

        this.svg.select(".season-legend")
            .attr("transform", `translate(${legendStartX}, ${legendY})`);
    }

    updateAxes() {
        // Update x-axis
        this.svg.select(".x.axis")
            .transition()
            .duration(750)
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top + this.innerHeight})`)
            .call(d3.axisBottom(this.xScale)
                .tickFormat((d, i) => this.monthNames[i]));

        // Update y-axis
        this.svg.select(".y.axis")
            .transition()
            .duration(750)
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`)
            .call(d3.axisLeft(this.yScale)
                .tickFormat(d => d.toFixed(2)))
            .on("end", () => {
                // Reapply label deduplication after transition
                requestAnimationFrame(() => {
                    this.dedupeYAxisLabels(this.svg.select(".y.axis").selectAll(".tick text"));
                });
            });

        // Update y-axis label position
        this.svg.select('.y-axis-label')
            .attr('transform', `translate(${this.margin.left * 1/5}, ${this.innerHeight/2}) rotate(-90)`);
    }

    redrawVisualization() {
        this.createScales();
        const boxWidth = this.xScale.bandwidth();

        // Select all existing box plots and bind new data
        const boxPlots = this.svg.selectAll(".boxplot")
            .data(this.formattedData);

        // Remove old elements
        boxPlots.exit().remove();

        // Update existing elements
        const boxPlotsUpdate = boxPlots
            .attr("transform", d => `translate(${this.margin.left + this.xScale(d.month)},${this.margin.top})`);

        boxPlotsUpdate.select("rect")
            .transition()
            .duration(750)
            .attr("y", d => this.yScale(d.q3))
            .attr("height", d => this.yScale(d.quartiles) - this.yScale(d.q3))
            .attr("width", boxWidth)
            .attr("fill", d => this.colors[d.season]);

        boxPlotsUpdate.select(".median-line")
            .transition()
            .duration(750)
            .attr("y1", d => this.yScale(d.median))
            .attr("y2", d => this.yScale(d.median))
            .attr("x1", 0)
            .attr("x2", boxWidth);

        boxPlotsUpdate.select(".whisker")
            .transition()
            .duration(750)
            .attr("y1", d => this.yScale(d.min))
            .attr("y2", d => this.yScale(d.max))
            .attr("x1", boxWidth / 2)
            .attr("x2", boxWidth / 2);

        // Remove existing whisker caps
        boxPlotsUpdate.selectAll(".whisker-cap").remove();

        // Redraw whisker caps for updated elements
        boxPlotsUpdate.append("line")
            .attr("class", "whisker-cap whisker-cap-min")
            .attr("y1", d => this.yScale(d.min))
            .attr("y2", d => this.yScale(d.min))
            .attr("x1", boxWidth * 0.25)
            .attr("x2", boxWidth * 0.75)
            .attr("stroke", "black");

        boxPlotsUpdate.append("line")
            .attr("class", "whisker-cap whisker-cap-max")
            .attr("y1", d => this.yScale(d.max))
            .attr("y2", d => this.yScale(d.max))
            .attr("x1", boxWidth * 0.25)
            .attr("x2", boxWidth * 0.75)
            .attr("stroke", "black");

        // Enter new elements
        const boxPlotsEnter = boxPlots.enter()
            .append("g")
            .attr("class", "boxplot")
            .attr("transform", d => `translate(${this.margin.left + this.xScale(d.month)},${this.margin.top})`);

        // Add rectangle for boxes
        boxPlotsEnter.append("rect")
            .attr("y", d => this.yScale(d.q3))
            .attr("height", d => this.yScale(d.quartiles) - this.yScale(d.q3))
            .attr("width", boxWidth)
            .attr("fill", d => this.colors[d.season])
            .attr("stroke", "black");

        // Add median line
        boxPlotsEnter.append("line")
            .attr("class", "median-line")
            .attr("y1", d => this.yScale(d.median))
            .attr("y2", d => this.yScale(d.median))
            .attr("x1", 0)
            .attr("x2", boxWidth)
            .attr("stroke", "black")
            .attr("stroke-width", 2);

        // Add whisker line
        boxPlotsEnter.append("line")
            .attr("class", "whisker")
            .attr("y1", d => this.yScale(d.min))
            .attr("y2", d => this.yScale(d.max))
            .attr("x1", boxWidth / 2)
            .attr("x2", boxWidth / 2)
            .attr("stroke", "black");

        // Add whisker caps for new elements
        boxPlotsEnter.append("line")
            .attr("class", "whisker-cap whisker-cap-min")
            .attr("y1", d => this.yScale(d.min))
            .attr("y2", d => this.yScale(d.min))
            .attr("x1", boxWidth * 0.25)
            .attr("x2", boxWidth * 0.75)
            .attr("stroke", "black");

        boxPlotsEnter.append("line")
            .attr("class", "whisker-cap whisker-cap-max")
            .attr("y1", d => this.yScale(d.max))
            .attr("y2", d => this.yScale(d.max))
            .attr("x1", boxWidth * 0.25)
            .attr("x2", boxWidth * 0.75)
            .attr("stroke", "black");

        // Add event listeners to both updated and new elements
        boxPlotsEnter.merge(boxPlotsUpdate)
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));

        // Update axes
        this.updateAxes();
    }

    async updateData(newIETDData, newIETDHour) {
        this.IETDData = newIETDData;
        this.IETDhour = newIETDHour;
        this.processData();

        // Update year selector with new years
        this.updateYearSelector();

        this.redrawVisualization();
    }

    destroy() {
        try {
            // Remove window event listener
            window.removeEventListener('resize', this.resize);

            // Remove all D3 elements from the container
            const container = d3.select(`#${this.containerId}`);

            // Remove SVG and all its children
            container.select("svg").remove();

            // Remove tooltip
            if (this.tooltip) this.tooltip.remove();

            // Remove year selector and its container
            container.select(".year-selector-container").remove();

            // Remove all box plots and their components
            container.selectAll(".boxplot").remove();
            container.selectAll(".whisker").remove();
            container.selectAll(".whisker-cap").remove();
            container.selectAll(".median-line").remove();

            // Remove axes
            container.select(".x.axis").remove();
            container.select(".y.axis").remove();

            // Remove titles and labels
            container.select(".title").remove();
            container.selectAll(".y-axis-label").remove();

            // Remove legend
            container.select(".season-legend").remove();

            // Clear all data references
            this.formattedData = null;
            this.IETDData = null;
            this.IETDhour = null;
            this.svg = null;
            this.tooltip = null;
            this.xScale = null;
            this.yScale = null;
            this.xAxis = null;
            this.yAxis = null;
            this.chartTitle = null;
            this.selectedYear = null;
            this.monthNames = null;
            this.colors = null;
            this.width = null;
            this.height = null;
            this.innerWidth = null;
            this.innerHeight = null;
            this.margin = null;

            // Remove all event listeners from box plots
            container.selectAll(".boxplot")
                .on("mouseover", null)
                .on("mouseout", null);

            // Call parent's destroy method
            super.destroy();

        } catch (error) {
            console.error('Error in destroy:', error);
        }
    }
}