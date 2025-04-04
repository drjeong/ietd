class AnnualCyclePlot extends FloatingBootboxChart {
    constructor(containerId, IETDhour, IETDData) {
        super(containerId);

        this.containerId = containerId;
        this.IETDhour = IETDhour;
        this.IETDData = IETDData;
        this.margin = { top: 20, right: 20, bottom: 50, left: 60 };
        this.title = "Annual Precipitation Cycle (Seasonal trends)";

        // Configuration
        this.colors = {
            Winter: '#0099cc',
            Spring: '#66cc33',
            Summer: '#ff9933',
            Fall: '#cc6633'
        };

        // Bind methods
        this.resize = this.resize.bind(this);
        this.processData = this.processData.bind(this);
        this.timeFormat = this.timeFormat.bind(this);

        // Initialize
        this.processData();
        this.initialize();
    }


    getAvailableYears() {
        const years = new Set();

        // Get years from dataset and convert to strings
        this.IETDData.forEach(d => {
            const year = new Date(d[0]).getFullYear().toString();
            years.add(year);
        });

        return ['all', ...Array.from(years).sort()];
    }

    timeFormat(date) {
        if (!date) return '';
        try {
            const d = new Date(date);
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            const year = d.getFullYear();
            const hour = d.getHours().toString().padStart(2, '0');
            return `${month}/${day}/${year} ${hour}h`;
        } catch (e) {
            return '';
        }
    }

    processData() {
        if (!Array.isArray(this.IETDData) || this.IETDData.length === 0) {
            console.error('Invalid or empty IETDData');
            return;
        }

        try {
            // Filter data based on selected year
            const filteredData = this.selectedYear === 'all'
                ? this.IETDData
                : this.IETDData.filter(data => {
                    const date = new Date(data[0]);
                    return date.getFullYear().toString() === this.selectedYear;
                });

            // Initialize an object to store data for each day of the year
            const dailyData = {};

            // Process each precipitation event
            filteredData.forEach(data => {
                const [dateFrom, dateTo, volume] = data;
                const startDate = new Date(dateFrom);
                const endDate = new Date(dateTo);

                // Calculate days difference
                const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
                const volumePerDay = Number(volume) / (daysDiff + 1); // Distribute volume across all days including start and end

                // Add volume for each day in the range
                for (let i = 0; i <= daysDiff; i++) {
                    const currentDate = new Date(startDate);
                    currentDate.setDate(startDate.getDate() + i);
                    const currentDayOfYear = this.getDayOfYear(currentDate);

                    if (!dailyData[currentDayOfYear]) {
                        dailyData[currentDayOfYear] = {
                            dayOfYear: currentDayOfYear,
                            values: [],
                            season: this.getSeason(currentDate)
                        };
                    }
                    dailyData[currentDayOfYear].values.push(volumePerDay);
                }
            });

            // Calculate statistics for each day
            this.formattedData = Object.values(dailyData)
                .map(group => ({
                    ...group,
                    mean: d3.mean(group.values),
                    count: group.values.length
                }))
                .sort((a, b) => a.dayOfYear - b.dayOfYear);

        } catch (error) {
            console.error('Error processing data:', error);
            return null;
        }
    }

    getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    getSeason(date) {
        const month = date.getMonth();
        if (month >= 2 && month <= 4) return 'Spring';
        if (month >= 5 && month <= 7) return 'Summer';
        if (month >= 8 && month <= 10) return 'Fall';
        return 'Winter';
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

    createYearSelector() {
        const selectorContainer = d3.select(`#${this.containerId}`)
            .append("div")
            .attr("class", "year-selector-container")  // Add a class for easy selection
            .style("position", "absolute")
            .style("top", "-5px")
            .style("right", "5px");

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
            .style("z-index", "999999")  // Very high z-index to appear above modal
            .style("visibility", "hidden")
            .attr("font-family", "Arial")
            .style('font-size', '11px')
            .style('color', 'black');
    }

    createScales() {
        this.xScale = d3.scaleLinear()
            .domain([1, 366])
            .range([0, this.innerWidth]);

        const maxValue = d3.max(this.formattedData, d => d.mean);
        this.yScale = d3.scaleSymlog()
            .domain([0, maxValue * 1.1])
            .range([this.innerHeight, 0])
            .constant(0.1);

        this.radiusScale = d3.scaleSqrt()
            .domain([1, d3.max(this.formattedData, d => d.values.length)])
            .range([2, 5]);
    }

    createAxes() {
        // Remove existing axes if they exist
        this.svg.selectAll(".x.axis").remove();
        this.svg.selectAll(".y.axis").remove();

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const monthTicks = monthNames.map((_, i) => {
            const date = new Date(2000, i, 1);
            return this.getDayOfYear(date);
        });

        const xAxis = d3.axisBottom(this.xScale)
            .tickValues(monthTicks)
            .tickFormat((d, i) => monthNames[i]);

        this.xAxis = this.svg.append("g")
            .attr("class", "x axis")
            .attr("color", "black")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top + this.innerHeight})`)
            .call(xAxis);

        // Modified y-axis creation with deduplication
        const yAxis = d3.axisLeft(this.yScale)
            .tickFormat(d => d.toFixed(2));

        this.yAxis = this.svg.append("g")
            .attr("class", "y axis")
            .attr("color", "black")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`)
            .call(yAxis);

        // Apply deduplication to y-axis labels
        this.dedupeYAxisLabels(this.svg.select(".y.axis").selectAll(".tick text"));
    }

    dedupeYAxisLabels(labels) {
        // Get all labels and their positions
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

        // Sort labels by position from top to bottom
        labelData.sort((a, b) => a.top - b.top);

        // Add small buffer to prevent near-overlaps
        const buffer = 2; // pixels

        // Make first label visible
        let lastVisibleLabel = labelData[0];
        d3.select(lastVisibleLabel.element)
            .style("opacity", 1);

        // Check rest of the labels
        for (let i = 1; i < labelData.length; i++) {
            const currentLabel = labelData[i];

            // Check if current label overlaps with last visible label
            // Add buffer to ensure no near-overlaps
            if (lastVisibleLabel.bottom + buffer > currentLabel.top) {
                // Hide if overlapping
                d3.select(currentLabel.element)
                    .style("opacity", 0);
            } else {
                // Show if not overlapping and update lastVisibleLabel
                d3.select(currentLabel.element)
                    .style("opacity", 1);
                lastVisibleLabel = currentLabel;
            }
        }

        // Optional: Log positions for debugging
        // console.log('Label positions:', labelData.map(l => ({
        //     value: l.value,
        //     top: l.top,
        //     bottom: l.bottom,
        //     visible: l.element.style.opacity !== "0"
        // })));
    }

    createVisualization() {
        const line = d3.line()
            .x(d => this.margin.left + this.xScale(d.dayOfYear))
            .y(d => this.margin.top + this.yScale(d.mean))
            .curve(d3.curveBasis);

        // Draw seasonal lines
        Object.keys(this.colors).forEach(season => {
            const seasonData = this.formattedData.filter(d => d.season === season);
            if (seasonData.length > 0) {
                if (season === 'Winter') {
                    // Split winter data into early (Jan-Feb) and late (Dec) parts
                    const earlyWinter = seasonData.filter(d => d.dayOfYear <= 59); // Before March
                    const lateWinter = seasonData.filter(d => d.dayOfYear >= 335); // December

                    // Draw early winter line
                    if (earlyWinter.length > 0) {
                        this.svg.append("path")
                            .datum(earlyWinter)
                            .attr("class", "line-winter-early")
                            .attr("fill", "none")
                            .attr("stroke", this.colors.Winter)
                            .attr("stroke-width", 2)
                            .attr("d", line);
                    }

                    // Draw late winter line
                    if (lateWinter.length > 0) {
                        this.svg.append("path")
                            .datum(lateWinter)
                            .attr("class", "line-winter-late")
                            .attr("fill", "none")
                            .attr("stroke", this.colors.Winter)
                            .attr("stroke-width", 2)
                            .attr("d", line);
                    }
                } else {
                    // Draw other seasons normally
                    this.svg.append("path")
                        .datum(seasonData)
                        .attr("class", `line-${season}`)
                        .attr("fill", "none")
                        .attr("stroke", this.colors[season])
                        .attr("stroke-width", 2)
                        .attr("d", line);
                }
            }
        });


        // Add data points
        this.points = this.svg.selectAll(".cycle-point")
            .data(this.formattedData)
            .enter()
            .append("circle")
            .attr("class", "cycle-point")
            .attr("cx", d => this.margin.left + this.xScale(d.dayOfYear))
            .attr("cy", d => this.margin.top + this.yScale(d.mean))
            .attr("r", d => this.radiusScale(d.values.length))
            .attr("fill", d => this.colors[d.season])
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));

        this.createTitles();
        this.createSeasonalLegend();
    }

    createSeasonalLegend() {
        // Remove existing seasonal legend if it exists
        this.svg.selectAll("g.season-legend").remove();

        const legendSpacing = 80; // Space between legend items
        const legendY = this.height - 20; // Position at bottom
        const seasons = ['Winter', 'Spring', 'Summer', 'Fall'];

        // Calculate total width of legend items
        const totalLegendWidth = seasons.length * legendSpacing;
        // Calculate starting x position to center the legend
        const legendStartX = this.margin.left + (this.innerWidth - totalLegendWidth) / 2;

        const legend = this.svg.append("g")
            .attr("class", "season-legend")
            .attr("transform", `translate(${legendStartX}, ${legendY})`);

        seasons.forEach((season, i) => {
            const group = legend.append("g")
                .attr("transform", `translate(${i * legendSpacing}, 0)`);

            // Add color circle
            group.append("circle")
                .attr("r", 3)
                .attr("fill", this.colors[season])
                .attr("stroke", "black")
                .attr("stroke-width", 1);

            // Add season text
            group.append("text")
                .attr("x", 15)
                .attr("y", 2)
                .attr("font-size", "10px")
                .style("alignment-baseline", "middle")
                .text(season);
        });
    }

    createTitles() {
        // Remove existing title and y-axis label
        this.svg.selectAll(".title.annualcycle").remove();
        this.svg.selectAll("g text[transform='rotate(-90)']").remove();

        this.chartTitle = this.svg.append("text")
            .attr("class", "title annualcycle")
            .attr("x", this.margin.left + this.innerWidth/2)
            .attr("y", 15)
            .attr('text-anchor', 'middle')
            .attr("font-family", "Arial")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text(`${this.title}`);

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

    handleMouseOver(event, d) {
        // this.tooltip.html(`
        //     <div style="padding: 3px; border-radius: 8px; box-shadow:0 10px 16px 0 rgba(0,0,0,0.2),0 6px 20px 0 rgba(0,0,0,0.19) !important;">
        //         Day of Year: ${d.dayOfYear}<br/>
        //         Season: ${d.season}<br/>
        //         Mean HPCP: ${d.mean.toFixed(2)} inches<br/>
        //         Number of Records: ${d.count}
        //     </div>`)
        //     .style("visibility", "visible")
        //     .style("top", (event.pageY - 10) + "px")
        //     .style("left", (event.pageX + 10) + "px");

        this.tooltip
            .html(
                this.createTooltipFormat(d, `
                Day of Year: ${d.dayOfYear}<br/>
                Season: ${d.season}<br/>
                Mean HPCP: ${d.mean.toFixed(2)} inches<br/>
                Number of Records: ${d.count}`)
            )
            .style("visibility", "visible")
            .style("top", (event.pageY - 10) + "px")
            .style("left", (event.pageX + 10) + "px");

        d3.select(event.target)
            .raise() // Brings element to front
            .attr("fill", "brown")
            .attr("stroke-width", 2);
    }

    handleMouseOut(event, d) {
        this.tooltip.style("visibility", "hidden");

        d3.select(event.target)
            .attr("fill", d => this.colors[d.season])
            .attr("stroke-width", 1);
    }

    resize() {
        // Check if the container is visible
        if (!this.isVisible()) return;

        // Check if the floating window is visible
        if (this.isFloatingWindowVisible()===true) return;

        const container = d3.select(`#${this.containerId}`);
        this.width = parseInt(container.style('width'));
        this.height = parseInt(container.style('height'));

        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        // Update SVG width
        this.svg.attr("width", this.width);

        // Update scales
        this.xScale.range([0, this.innerWidth]);
        this.yScale.range([this.innerHeight, 0]);

        // Update axes
        this.updateAxes();

        // Redraw visualization
        this.redrawVisualization();
        //
        //
        // // Update lines
        // this.updateLines();
        //
        // // Update points
        // this.svg.selectAll(".cycle-point")
        //     .transition()
        //     .duration(500)
        //     .attr("cx", d => this.margin.left + this.xScale(d.dayOfYear))
        //     .attr("cy", d => this.margin.top + this.yScale(d.mean));
        //
        // // Update title position
        // this.chartTitle
        //     .attr("x", this.margin.left + this.innerWidth/2);
        //
        // // Update y-axis label position
        // this.svg.select('.y-axis-label')
        //     .attr('x', -(this.height/2))
        //     .attr('y', this.margin.left * 1/5);
        //
        // // Update legend position
        // this.updateLegend();
    }

    updateLegend() {
        const legendSpacing = 80;
        const legendY = this.height - 20;
        const seasons = ['Winter', 'Spring', 'Summer', 'Fall'];
        const totalLegendWidth = seasons.length * legendSpacing;
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
                .tickValues(Array.from({length: 12}, (_, i) => {
                    const date = new Date(2000, i, 1);
                    return this.getDayOfYear(date);
                }))
                .tickFormat((d, i) => {
                    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i];
                }));

        // Update y-axis and apply deduplication after transition
        this.svg.select(".y.axis")
            .transition()
            .duration(750)
            .call(d3.axisLeft(this.yScale)
                .tickFormat(d => d.toFixed(2)))
            .on("end", () => {
                // Wait a brief moment for DOM to fully update
                requestAnimationFrame(() => {
                    this.dedupeYAxisLabels(this.svg.select(".y.axis").selectAll(".tick text"));
                });
            });
    }

    updateLines() {
        // Update lines
        const line = d3.line()
            .x(d => this.margin.left + this.xScale(d.dayOfYear))
            .y(d => this.margin.top + this.yScale(d.mean))
            .curve(d3.curveBasis);

        // Remove existing lines
        this.svg.selectAll("[class*='line-']").remove();

        // Add new seasonal lines
        Object.keys(this.colors).forEach(season => {
            const seasonData = this.formattedData.filter(d => d.season === season);
            if (seasonData.length > 0) {
                if (season === 'Winter') {
                    // Split winter data into early and late parts
                    const earlyWinter = seasonData.filter(d => d.dayOfYear <= 59);
                    const lateWinter = seasonData.filter(d => d.dayOfYear >= 335);

                    // Draw early winter line
                    if (earlyWinter.length > 0) {
                        this.svg.append("path")
                            .datum(earlyWinter)
                            .attr("class", "line-winter-early")
                            .attr("fill", "none")
                            .attr("stroke", this.colors.Winter)
                            .attr("stroke-width", 2)
                            .attr("d", line);
                    }

                    // Draw late winter line
                    if (lateWinter.length > 0) {
                        this.svg.append("path")
                            .datum(lateWinter)
                            .attr("class", "line-winter-late")
                            .attr("fill", "none")
                            .attr("stroke", this.colors.Winter)
                            .attr("stroke-width", 2)
                            .attr("d", line);
                    }
                } else {
                    // Draw other seasons normally
                    this.svg.append("path")
                        .datum(seasonData)
                        .attr("class", `line-${season}`)
                        .attr("fill", "none")
                        .attr("stroke", this.colors[season])
                        .attr("stroke-width", 2)
                        .attr("d", line);
                }
            }
        });
    }

    updateVisualization() {
        // Update scales
        this.createScales();

        // Update the chart
        this.updateData(this.IETDData, this.IETDhour);

        // Update title to show selected year
        this.svg.select(".title.annualcycle")
            .text(`${this.title} ${this.selectedYear === 'all' ? '' : `(${this.selectedYear})`}`);
    }
    
    async updateData(newIETDData, newIETDHour) {
        this.IETDData = newIETDData;
        this.IETDhour = newIETDHour;

        this.processData();

        // Update year selector with new years
        this.updateYearSelector();

        this.createScales();

        this.redrawVisualization();
    }

    redrawVisualization() {
        this.svg.selectAll(".cycle-point").remove();

        // update axes
        this.updateAxes();

        // update lines
        this.updateLines();

        // update legend
        this.updateLegend();

        // Update points
        const points = this.svg.selectAll(".cycle-point")
            .data(this.formattedData);

        // Remove old points
        points.exit().remove();

        // Update existing points
        points.transition()
            .duration(750)
            .attr("cx", d => this.margin.left + this.xScale(d.dayOfYear))
            .attr("cy", d => this.margin.top + this.yScale(d.mean))
            .attr("fill", d => this.colors[d.season]);

        // Add new points
        points.enter()
            .append("circle")
            .attr("class", "cycle-point")
            .attr("r", 3)
            .attr("fill", d => this.colors[d.season])
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .attr("cx", d => this.margin.left + this.xScale(d.dayOfYear))
            .attr("cy", d => this.margin.top + this.yScale(d.mean))
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));


        this.createTitles();

        this.createSeasonalLegend();
    }

    openFloatingChart(width, height) {
        this.resizeFloatingChart(width, height);
    }

    closeFloatingChart() {
        this.createSvg();
        this.createScales();
        this.createAxes();
        this.resize();
    }

    resizeFloatingChart(width, height) {
        this.width = width;
        this.height = height;

        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        // Update SVG
        this.svg
            .attr("width", this.width)
            .attr("height", this.height);

        // Update title
        this.chartTitle
            .attr("x", this.margin.left + this.innerWidth/2);

        // Update scales
        this.xScale.range([0, this.innerWidth]);
        this.yScale.range([this.innerHeight, 0]);

        this.redrawVisualization();

        // Get the current container (either original or floating)
        const currentContainer = this.svg.node().parentNode;

        // First create/update year selector
        const existingSelector = d3.select(currentContainer).select(".year-selector-container");
        if (existingSelector.empty()) {
            // Create year selector if it doesn't exist
            const selectorContainer = d3.select(currentContainer)
                .append("div")
                .attr("class", "year-selector-container")
                .style("position", "absolute")
                .style("top", "5px")
                .style("right", "5px")
                .style("z-index", "1000");  // Ensure it's above the chart

            const select = selectorContainer
                .append("select")
                .attr("class", "year-selector")
                .style("padding", "2px 2px")
                .style("font-family", "Arial")
                .style("font-size", "10px")
                .on("change", (event) => {
                    this.selectedYear = event.target.value;
                    this.processData();
                    this.updateVisualization();
                });
        }

        // Update the year selector in the current container
        const select = d3.select(currentContainer).select(".year-selector");

        // Get years
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

        // If current selection is no longer valid, reset to 'all'
        if (!this.selectedYear || !years.includes(this.selectedYear)) {
            select.property("value", 'all');
            this.selectedYear = 'all';
        } else {
            select.property("value", this.selectedYear);
        }

        // Reattach event listeners to points
        this.svg.selectAll(".cycle-point")
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));
    }


    destroy() {
        try {
            // Remove window event listener
            window.removeEventListener('resize', this.resize);

            // Remove SVG
            d3.select(`#${this.containerId}`).select("svg").remove();

            // Remove tooltip
            if (this.tooltip) this.tooltip.remove();

            // Remove year selector container
            d3.select(`#${this.containerId}`).select(".year-selector-container").remove();

            // Remove all paths (lines)
            d3.select(`#${this.containerId}`).selectAll("[class*='line-']").remove();

            // Remove all points
            d3.select(`#${this.containerId}`).selectAll(".cycle-point").remove();

            // Remove axes
            d3.select(`#${this.containerId}`).select(".x.axis").remove();
            d3.select(`#${this.containerId}`).select(".y.axis").remove();

            // Remove titles and labels
            d3.select(`#${this.containerId}`).select(".title").remove();
            d3.select(`#${this.containerId}`).select(".y-axis-label").remove();

            // Remove legend
            d3.select(`#${this.containerId}`).select(".season-legend").remove();

            // Clear all data references
            this.formattedData = null;
            this.IETDData = null;
            this.IETDhour = null;
            this.svg = null;
            this.xScale = null;
            this.yScale = null;
            this.radiusScale = null;
            this.xAxis = null;
            this.yAxis = null;
            this.points = null;
            this.chartTitle = null;
            this.tooltip = null;
            this.selectedYear = null;

            // Call parent's destroy method last
            super.destroy();
        } catch (error) {
            console.error('Error in destroy:', error);
        }
    }
}