class TrendAnalysisPlot extends ChartCommons{
    constructor(containerId, IETDhour, IETDData, options = {}) {
        super(containerId);
        this.containerId = containerId;
        this.IETDhour = IETDhour;
        this.IETDData = IETDData;
        this.margin = { top: 20, right: 20, bottom: 50, left: 60 };
        this.title = "Trend Analysis";

        // Trend analysis options with defaults
        this.options = {
            method: 'linear',
            polynomialDegree: 2,
            season: 'all', // Add this line
            ...options
        };

        // Add options
        this.seasons = [
            { id: 'all', label: 'All Seasons' },
            { id: 'spring', label: 'Spring' },
            { id: 'summer', label: 'Summer' },
            { id: 'fall', label: 'Fall' },
            { id: 'winter', label: 'Winter' }
        ];

        // Colors for different trend lines
        this.trendColors = {
            linear: 'red',
            polynomial: 'red',
            exponential: 'red'
        };

        // Bind methods
        this.resize = this.resize.bind(this);
        this.processData = this.processData.bind(this);
        this.timeFormat = this.timeFormat.bind(this);

        // Initialize
        this.processData();
        this.initialize();
    }

    getSeason(date) {
        const month = date.getMonth() + 1;
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 11) return 'fall';
        return 'winter';
    }

    filterDataBySeason(season) {
        if (season === 'all') return this.formattedData;
        return this.formattedData.filter(d => {
            const month = d.date.getMonth() + 1;
            switch(season) {
                case 'spring': return month >= 3 && month <= 5;
                case 'summer': return month >= 6 && month <= 8;
                case 'fall': return month >= 9 && month <= 11;
                case 'winter': return month === 12 || month <= 2;
                default: return true;
            }
        });
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
            this.formattedData = this.IETDData.map(data => {
                const [datefrom, dateto, volume] = data;
                const date = new Date(datefrom);
                return {
                    date: date,
                    volume: volume,
                    from: datefrom,
                    to: dateto,
                    period: `${this.timeFormat(datefrom)} ~ ${this.timeFormat(dateto)}`
                };
            }).sort((a, b) => a.date - b.date);

            // Calculate trend line using linear regression
            const xValues = this.formattedData.map(d => d.date.getTime());
            const yValues = this.formattedData.map(d => d.volume);

            const xMean = d3.mean(xValues);
            const yMean = d3.mean(yValues);

            let numerator = 0;
            let denominator = 0;

            for (let i = 0; i < xValues.length; i++) {
                numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
                denominator += Math.pow(xValues[i] - xMean, 2);
            }

            this.slope = numerator / denominator;
            this.intercept = yMean - (this.slope * xMean);

        } catch (error) {
            console.error('Error processing trend data:', error);
            return null;
        }
    }

    initialize() {
        const container = d3.select(`#${this.containerId}`);
        this.width = parseInt(container.style('width'));
        this.height = parseInt(container.style('height'));
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        this.createSvg();
        this.createScales();
        this.createAxes();
        this.createVisualization();

        window.addEventListener('resize', this.resize);
    }

    createSeasonSelector() {
        const selectorContainer = d3.select(`#${this.containerId}`)
            .append("div")
            .attr("class", "season-selector-container")
            .style("position", "absolute")
            .style("top", "-5px")
            .style("right", "20px")
            .style("z-index", "100");

        // Create select element
        const select = selectorContainer
            .append("select")
            .attr("class", "season-select")
            .style("padding", "2px 2px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "4px")
            .style("background-color", "white")
            .style("font-family", "Arial")
            .style("font-size", "10px")
            .style("cursor", "pointer")
            .on("change", (event) => {
                this.updateSeason(event.target.value);
            });

        select.selectAll("option")
            .data(this.seasons)
            .enter()
            .append("option")
            .attr("value", d => d.id)
            .text(d => d.label)
            .property("selected", d => d.id === this.options.season);
    }

    updateSeason(newSeason) {
        this.options.season = newSeason;

        // Filter data by season
        const seasonalData = this.filterDataBySeason(newSeason);

        // Update formattedData temporarily for regression calculation
        const originalData = this.formattedData;
        this.formattedData = seasonalData;

        // Update scales with seasonal data
        this.xScale.domain(d3.extent(seasonalData, d => d.date));
        this.yScale.domain([0, d3.max(seasonalData, d => d.volume)]);

        // Update points visibility
        this.points
            .style("display", d =>
                newSeason === 'all' || this.getSeason(d.date) === newSeason ? null : "none");

        // Update axes
        this.svg.select(".x.axis")
            .transition()
            .duration(750)
            .call(d3.axisBottom(this.xScale)
                .ticks(d3.timeYear.every(1))
                .tickFormat(d3.timeFormat("%Y")))
            .on("end", () => {
                this.dedupeLabels(this.svg.select(".x.axis").selectAll(".tick text"));
            });

        this.svg.select(".y.axis")
            .transition()
            .duration(750)
            .call(d3.axisLeft(this.yScale).ticks(5)
                .tickFormat(d => d3.format("")(d)));

        // Remove existing trend line and R² text
        this.svg.selectAll(".trend-line").remove();

        // Calculate and draw new trend line
        if (seasonalData.length >= 2) {
            const xValues = seasonalData.map(d => d.date.getTime());
            const yValues = seasonalData.map(d => d.volume);

            let trend;
            switch(this.options.method) {
                case 'linear':
                    trend = this.calculateLinearTrend(xValues, yValues);
                    break;
                case 'polynomial':
                    trend = this.calculatePolynomialTrend(xValues, yValues, this.options.polynomialDegree);
                    break;
                case 'exponential':
                    trend = this.calculateExponentialTrend(xValues, yValues);
                    break;
            }

            if (trend) {
                const mkResult = this.calculateMannKendall(yValues);

                // Draw trend line
                const lineGenerator = d3.line()
                    .x(d => this.margin.left + this.xScale(d.date))
                    .y(d => this.margin.top + this.yScale(trend.predict(d.date.getTime())));

                this.trendLine = this.svg.append("path")
                    .datum(seasonalData)
                    .attr("class", "trend-line")
                    .attr("fill", "none")
                    .attr("stroke", this.trendColors[this.options.method])
                    .attr("stroke-width", 2)
                    .attr("d", lineGenerator);

                // add statistics
                this.addStatistics(trend, mkResult);
            }
        } else {
            // Add message if not enough data
            this.svg.append("text")
                .attr("class", "r-squared")
                .attr("x", this.margin.left * 1/5)
                .attr("y", this.margin.top + this.innerHeight + 35)
                .attr("font-family", "Arial")
                .attr("font-size", "10px")
                .text("Insufficient data for trend analysis");
        }

        this.updateTitle();

        // Restore original formatted data
        this.formattedData = originalData;
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
            .style("z-index", "10")
            .style("visibility", "hidden")
            .attr("font-family", "Arial")
            .style('font-size', '11px')
            .style('color', 'black');
    }

    createScales() {
        this.xScale = d3.scaleTime()
            .domain(d3.extent(this.formattedData, d => d.date))
            .range([0, this.innerWidth]);

        this.yScale = d3.scaleSymlog()
            .domain([0, d3.max(this.formattedData, d => d.volume)])
            .range([this.innerHeight, 0]);
    }

    dedupeLabels(labels) {
        const rects = [];
        labels.each(function(d, i) {
            const bbox = this.getBoundingClientRect();
            rects.push({
                index: i,
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height,
                element: this,
                visible: true
            });
        });

        rects.sort((a, b) => a.x - b.x);
        let lastVisibleIndex = 0;

        for (let i = 1; i < rects.length; i++) {
            const curr = rects[i];
            const lastVisible = rects[lastVisibleIndex];

            if (lastVisible.x + lastVisible.width + 5 > curr.x) {
                d3.select(curr.element).style("opacity", 0);
                curr.visible = false;
            } else {
                d3.select(curr.element).style("opacity", 1);
                curr.visible = true;
                lastVisibleIndex = i;
            }

            if (!curr.visible) {
                let prevVisibleIndex = lastVisibleIndex;
                for (let j = i - 1; j >= 0; j--) {
                    if (rects[j].visible) {
                        prevVisibleIndex = j;
                        break;
                    }
                }

                if (rects[prevVisibleIndex].x + rects[prevVisibleIndex].width + 5 <= curr.x) {
                    d3.select(curr.element).style("opacity", 1);
                    curr.visible = true;
                    lastVisibleIndex = i;
                }
            }
        }
    }

    createAxes() {
        const xAxis = d3.axisBottom(this.xScale)
            .ticks(d3.timeYear.every(1))
            .tickFormat(d3.timeFormat("%Y"));

        this.xAxis = this.svg.append("g")
            .attr("class", "x axis")
            .attr("color", "black")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top + this.innerHeight})`)
            .call(xAxis);

        // Apply deduping to x-axis labels
        this.dedupeLabels(this.svg.select(".x.axis").selectAll(".tick text"));

        this.yAxis = this.svg.append("g")
            .attr("class", "y axis")
            .attr("color", "black")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`)
            .call(d3.axisLeft(this.yScale).ticks(5)
                .tickFormat(d => d3.format("")(d)));
    }

    // calculateTrends() {
    //     const xValues = this.formattedData.map(d => d.date.getTime());
    //     const yValues = this.formattedData.map(d => d.volume);
    //
    //     const trends = {};
    //
    //     // 1. Linear Regression
    //     trends.linear = this.calculateLinearTrend(xValues, yValues);
    //
    //     // 2. Polynomial Regression
    //     trends.polynomial = this.calculatePolynomialTrend(xValues, yValues, this.options.polynomialDegree);
    //
    //     // 3. Exponential Regression
    //     trends.exponential = this.calculateExponentialTrend(xValues, yValues);
    //
    //     return trends;
    // }


    calculateLinearTrend(xValues, yValues) {
        try {
            const n = xValues.length;

            // Calculate means
            const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
            const yMean = yValues.reduce((sum, y) => sum + y, 0) / n;

            // Calculate slope and intercept
            let numerator = 0;
            let denominator = 0;

            for (let i = 0; i < n; i++) {
                numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
                denominator += Math.pow(xValues[i] - xMean, 2);
            }

            const slope = numerator / denominator;
            const intercept = yMean - (slope * xMean);

            // Create prediction function
            const predict = x => {
                try {
                    const result = slope * x + intercept;
                    return isFinite(result) ? result : null;
                } catch {
                    return null;
                }
            };

            // Calculate predicted values and R-squared
            const predictedValues = xValues.map(predict);
            const rSquared = this.calculateRSquared(yValues, predictedValues);

            return {
                type: 'linear',
                slope: slope,
                intercept: intercept,
                predict: predict,
                rSquared: rSquared,
                equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`
            };
        } catch (error) {
            console.error('Error in linear regression:', error);
            return {
                type: 'linear',
                predict: () => null,
                rSquared: 0,
                equation: 'Error in linear fit'
            };
        }
    }

    calculatePolynomialTrend(xValues, yValues, degree) {
        try {
            // Normalize x values to prevent numerical issues
            const xMin = Math.min(...xValues);
            const xMax = Math.max(...xValues);
            const normalizedX = xValues.map(x => (x - xMin) / (xMax - xMin));

            // Create Vandermonde matrix
            const X = [];
            for (let i = 0; i < normalizedX.length; i++) {
                const row = [];
                for (let j = 0; j <= degree; j++) {
                    row.push(Math.pow(normalizedX[i], j));
                }
                X.push(row);
            }

            // Matrix transpose
            const XT = this.transpose(X);

            // Matrix multiplication X'X
            const XTX = this.matrixMultiply(XT, X);

            // Matrix inverse (X'X)^-1
            const XTXInv = this.inverseMatrix(XTX);

            // Matrix multiplication X'y
            const XTy = this.matrixMultiply(XT, yValues.map(y => [y]));

            // Final coefficients
            const coefficients = this.matrixMultiply(XTXInv, XTy).map(row => row[0]);

            // Create prediction function
            const predict = x => {
                try {
                    const xNorm = (x - xMin) / (xMax - xMin);
                    return coefficients.reduce((sum, coef, i) => sum + coef * Math.pow(xNorm, i), 0);
                } catch (error) {
                    return null;
                }
            };

            // Calculate predicted values and R-squared
            const predictedValues = xValues.map(predict);
            const rSquared = this.calculateRSquared(yValues, predictedValues);

            // Create equation string
            const equation = coefficients
                .map((coef, i) => {
                    if (i === 0) return coef.toFixed(4);
                    if (i === 1) return `${coef.toFixed(4)}x`;
                    return `${coef.toFixed(4)}x^${i}`;
                })
                .filter(term => term !== '0.0000')
                .join(' + ')
                .replace(/\+ -/g, '- ');

            return {
                type: 'polynomial',
                coefficients,
                predict,
                rSquared,
                equation: `y = ${equation}`
            };
        } catch (error) {
            console.error('Error in polynomial regression:', error);
            return {
                type: 'polynomial',
                predict: () => null,
                rSquared: 0,
                equation: 'Error in polynomial fit'
            };
        }
    }

// Matrix helper functions
    transpose(matrix) {
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    }

    matrixMultiply(a, b) {
        return a.map(row => {
            return b[0].map((_, j) => {
                return row.reduce((sum, element, i) => {
                    return sum + element * (b[i][j] || b[i]);
                }, 0);
            });
        });
    }

    inverseMatrix(matrix) {
        const n = matrix.length;

        // Create augmented matrix [A|I]
        const augmented = matrix.map((row, i) => [
            ...row,
            ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)
        ]);

        // Gauss-Jordan elimination
        for (let i = 0; i < n; i++) {
            // Find pivot
            let maxRow = i;
            for (let j = i + 1; j < n; j++) {
                if (Math.abs(augmented[j][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = j;
                }
            }

            // Swap maximum row with current row
            if (maxRow !== i) {
                [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
            }

            // Make pivot = 1
            const pivot = augmented[i][i];
            if (Math.abs(pivot) < 1e-10) {
                throw new Error("Matrix is singular");
            }

            for (let j = i; j < 2 * n; j++) {
                augmented[i][j] /= pivot;
            }

            // Eliminate column
            for (let j = 0; j < n; j++) {
                if (i !== j) {
                    const factor = augmented[j][i];
                    for (let k = i; k < 2 * n; k++) {
                        augmented[j][k] -= factor * augmented[i][k];
                    }
                }
            }
        }

        // Extract right half (inverse matrix)
        return augmented.map(row => row.slice(n));
    }

    calculateExponentialTrend(xValues, yValues) {
        try {
            // First normalize timestamps to days from the first date
            const baseTime = Math.min(...xValues);
            const normalizedX = xValues.map(x => (x - baseTime) / (24 * 60 * 60 * 1000)); // Convert to days

            // Filter out non-positive y values and create pairs
            const validPairs = normalizedX.map((x, i) => ({x, y: yValues[i]}))
                .filter(pair => pair.y > 0);

            if (validPairs.length < 2) {
                throw new Error('Insufficient valid data points for exponential regression');
            }

            // Sort pairs by x value to ensure proper trend calculation
            validPairs.sort((a, b) => a.x - b.x);

            const x = validPairs.map(pair => pair.x);
            const y = validPairs.map(pair => pair.y);

            // Find min and max y values for scaling
            const yMin = Math.min(...y);
            const yMax = Math.max(...y);

            // Scale y values to range [1, 10] before taking log
            const scaledY = y.map(val => 1 + 9 * (val - yMin) / (yMax - yMin));
            const lnY = scaledY.map(val => Math.log(val));

            // Perform linear regression on log-transformed data
            const n = x.length;
            const xMean = x.reduce((sum, val) => sum + val, 0) / n;
            const lnYMean = lnY.reduce((sum, val) => sum + val, 0) / n;

            let numerator = 0;
            let denominator = 0;

            for (let i = 0; i < n; i++) {
                numerator += (x[i] - xMean) * (lnY[i] - lnYMean);
                denominator += Math.pow(x[i] - xMean, 2);
            }

            const b = numerator / denominator;
            const lnA = lnYMean - b * xMean;
            const a = Math.exp(lnA);

            // Create prediction function that works with original timestamps
            const predict = timestamp => {
                try {
                    const days = (timestamp - baseTime) / (24 * 60 * 60 * 1000);
                    // Get scaled prediction
                    const scaledPred = a * Math.exp(b * days);
                    // Transform back to original scale
                    const result = yMin + (scaledPred - 1) * (yMax - yMin) / 9;
                    return isFinite(result) ? result : null;
                } catch {
                    return null;
                }
            };

            // Calculate predicted values
            const predictedValues = xValues.map(predict);

            // Calculate R² using original scale values
            const validPredictions = yValues.map((actual, i) => ({
                actual,
                predicted: predictedValues[i]
            })).filter(pair => pair.predicted !== null && pair.actual > 0);

            const rSquared = validPredictions.length >= 2 ?
                this.calculateRSquared(
                    validPredictions.map(p => p.actual),
                    validPredictions.map(p => p.predicted)
                ) : 0;

            // Debug information
            // console.log('Exponential Regression Details:', {
            //     dataPoints: validPredictions.length,
            //     yRange: [yMin, yMax],
            //     coefficients: { a, b },
            //     sampleFit: validPredictions.slice(0, 5).map(p => ({
            //         actual: p.actual,
            //         predicted: p.predicted
            //     })),
            //     rSquared
            // });

            return {
                type: 'exponential',
                a: a,
                b: b,
                predict: predict,
                rSquared: rSquared,
                equation: `y = ${a.toFixed(4)}e^(${b.toFixed(4)}x)`
            };
        } catch (error) {
            console.error('Error in exponential regression:', error);
            return {
                type: 'exponential',
                predict: () => null,
                rSquared: 0,
                equation: 'Error in exponential fit'
            };
        }
    }

    calculateRSquared(actual, predicted) {
        try {
            // Filter out any null, undefined, or NaN values
            const validPairs = actual.map((y, i) => ({actual: y, predicted: predicted[i]}))
                .filter(pair => pair.actual != null && pair.predicted != null &&
                    !isNaN(pair.actual) && !isNaN(pair.predicted));

            if (validPairs.length === 0) return 0;

            const actualValues = validPairs.map(p => p.actual);
            const predictedValues = validPairs.map(p => p.predicted);

            const mean = actualValues.reduce((sum, val) => sum + val, 0) / actualValues.length;

            // Total Sum of Squares
            const totalSS = actualValues.reduce((sum, y) => sum + Math.pow(y - mean, 2), 0);

            // Residual Sum of Squares
            const residualSS = actualValues.reduce((sum, y, i) =>
                sum + Math.pow(y - predictedValues[i], 2), 0);

            const rSquared = 1 - (residualSS / totalSS);

            // If R² is negative, return 0 as it indicates the model is worse than horizontal line
            return Math.max(0, rSquared);
        } catch (error) {
            console.error('Error calculating R-squared:', error);
            return 0;
        }
    }

    // Matrix operations helpers
    transpose(matrix) {
        return matrix[0].map((_, i) => matrix.map(row => row[i]));
    }

    matrixMultiply(a, b) {
        return a.map(row =>
            b[0].map((_, i) =>
                row.reduce((sum, val, j) => sum + val * b[j][i], 0)
            )
        );
    }

    inverseMatrix(matrix) {
        // Simple Gaussian elimination for small matrices
        const n = matrix.length;
        const augmented = matrix.map((row, i) =>
            [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]
        );

        for (let i = 0; i < n; i++) {
            const pivot = augmented[i][i];
            for (let j = 0; j < 2 * n; j++) {
                augmented[i][j] /= pivot;
            }

            for (let k = 0; k < n; k++) {
                if (k !== i) {
                    const factor = augmented[k][i];
                    for (let j = 0; j < 2 * n; j++) {
                        augmented[k][j] -= factor * augmented[i][j];
                    }
                }
            }
        }

        return augmented.map(row => row.slice(n));
    }


    createVisualization() {
        // Create season selector first
        this.createSeasonSelector();

        // Create scatter plot points
        this.points = this.svg.selectAll(".point")
            .data(this.formattedData)
            .enter()
            .append("circle")
            .attr("class", "trendanalysis_point")
            .attr("data-indicator", d => d.period)
            .attr("cx", d => this.margin.left + this.xScale(d.date))
            .attr("cy", d => this.margin.top + this.yScale(d.volume))
            .attr("r", 3)
            .attr("fill", "steelblue")
            .attr("opacity", 0.6)
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));

        // Draw initial trend line
        this.updateTrendMethod(this.options.method);

        // Create method selector
        this.createMethodSelector();

        this.createTitles();
    }

    createMethodSelector() {
        const selectorGroup = this.svg.append("g")
            .attr("class", "method-selector")
            .attr("transform", this.getMethodSelectorPosition()); // Position will be calculated

        // Create background rectangle with minimal padding
        selectorGroup.append("rect")
            .attr("width", 320)  // Width for the selector
            .attr("height", 24)  // Height
            .attr("fill", "white")
            .attr("stroke", "#ccc")
            .attr("rx", 4)
            .attr("ry", 4)
            .attr("opacity", 0.9);

        const methods = [
            { id: 'linear', label: 'Linear Regression' },
            { id: 'polynomial', label: 'Polynomial (deg=2)' },
            { id: 'exponential', label: 'Exponential' }
        ];

        // Create radio buttons and labels horizontally with tight spacing
        const radioGroups = selectorGroup.selectAll("g.radio-group")
            .data(methods)
            .enter()
            .append("g")
            .attr("class", "radio-group")
            .attr("transform", (d, i) => `translate(${10 + i * 120}, 12)`);

        // Add radio buttons
        radioGroups.append("circle")
            .attr("class", "radio-button")
            .attr("r", 4)
            .attr("fill", "white")
            .attr("stroke", "#666")
            .attr("cursor", "pointer")
            .attr("opacity", 0.7)
            .on("mouseover", function() {
                d3.select(this).attr("opacity", 1);
            })
            .on("mouseout", function() {
                d3.select(this).attr("opacity", 0.7);
            })
            .on("click", (event, d) => this.updateTrendMethod(d.id));

        // Add labels
        radioGroups.append("text")
            .attr("x", 10)
            .attr("y", 4)
            .attr("font-family", "Arial")
            .attr("font-size", "10px")
            .attr("cursor", "pointer")
            .text(d => d.label)
            .on("click", (event, d) => this.updateTrendMethod(d.id));

        // Add initial selection
        this.updateRadioButtons(this.options.method);
    }

// Add this helper method to calculate the position
    getMethodSelectorPosition() {
        const rightEdge = this.margin.left + this.innerWidth;
        const xPosition = rightEdge - 320; // 320 is the width of the selector
        const yPosition = this.margin.top + this.innerHeight + 20;
        return `translate(${xPosition}, ${yPosition})`;
    }

// Add this method to update the position when resizing
    updateMethodSelectorPosition() {
        this.svg.select(".method-selector")
            .transition()
            .duration(750)
            .attr("transform", this.getMethodSelectorPosition());
    }

    updateRadioButtons(selectedMethod) {
        this.svg.selectAll(".radio-button")
            .attr("fill", d => d.id === selectedMethod ? "#666" : "white");
    }

    updateTrendMethod(newMethod) {
        this.options.method = newMethod;
        this.updateRadioButtons(newMethod);

        // Remove existing trend line and R² text
        this.svg.selectAll(".trend-line").remove();

        // Get the filtered data based on current season
        const seasonalData = this.filterDataBySeason(this.options.season);

        // Get the x and y values for regression from seasonal data
        const xValues = seasonalData.map(d => d.date.getTime());
        const yValues = seasonalData.map(d => d.volume);

        // Calculate the selected trend
        let trend;
        switch(newMethod) {
            case 'linear':
                trend = this.calculateLinearTrend(xValues, yValues);
                break;
            case 'polynomial':
                trend = this.calculatePolynomialTrend(xValues, yValues, this.options.polynomialDegree);
                break;
            case 'exponential':
                trend = this.calculateExponentialTrend(xValues, yValues);
                break;
        }

        // Store the current trend
        this.currentTrend = trend;

        // Draw the trend line
        if (trend) {
            const mkResult = this.calculateMannKendall(yValues);

            const lineGenerator = d3.line()
                .x(d => this.margin.left + this.xScale(d.date))
                .y(d => this.margin.top + this.yScale(trend.predict(d.date.getTime())));

            this.trendLine = this.svg.append("path")
                .datum(this.formattedData)
                .attr("class", "trend-line")
                .attr("fill", "none")
                .attr("stroke", this.trendColors[newMethod])
                .attr("stroke-width", 2)
                .attr("d", lineGenerator);

            // add statistics
            this.addStatistics(trend, mkResult);
        }
    }

    addStatistics(trend, mkResult) {
        this.svg.selectAll(".stats-container").remove();

        // Add statistics using foreignObject
        const statsContainer = this.svg.append("foreignObject")
            .attr("class", "stats-container")
            .attr("x", this.margin.left * 1/5)
            .attr("y", this.margin.top + this.innerHeight + 15)
            .attr("width", 200)
            .attr("height", 100)
            .attr("color", "black")
            .append("xhtml:div")
            .style("font-size", "12px")  // Base font size
            .style("line-height", "1.2"); // Tighter line height

        // Add R-squared with LaTeX
        statsContainer.append("div")
            .style("margin-bottom", "2px")
            .html(`\\(\\small{R^2 = ${trend.rSquared.toFixed(3)}}\\)`);

        // Add p-value and tau with LaTeX
        statsContainer.append("div")
            .html(`\\(\\small{p = ${mkResult.pValue.toFixed(4)} \\,\\, (\\tau = ${mkResult.tau.toFixed(3)})}\\)`);

        // Trigger MathJax rendering
        if (window.MathJax) {
            MathJax.typesetPromise([statsContainer.node()]).catch((err) => console.log('MathJax error:', err));
        }
    }

    // Add to your class
    calculateMannKendall(values) {
        let S = 0;
        let n = values.length;

        // Calculate S statistic
        for(let i = 0; i < n-1; i++) {
            for(let j = i+1; j < n; j++) {
                S += Math.sign(values[j] - values[i]);
            }
        }

        // Calculate variance
        let variance = (n * (n-1) * (2*n + 5)) / 18;

        // Calculate Z score
        let Z = (S > 0 ? S-1 : S+1) / Math.sqrt(variance);

        // Calculate p-value using jStat (two-tailed test)
        let pValue = 2 * (1 - jStat.normal.cdf(Math.abs(Z), 0, 1));

        return {
            S: S,
            Z: Z,
            pValue: pValue,
            tau: S / (n * (n-1) / 2)
        };
    }

    calculateModifiedMannKendall(values) {
        const n = values.length;

        // Calculate lag-k autocorrelation coefficient
        const calculateAutoCorr = (data, lag) => {
            let mean = data.reduce((a, b) => a + b, 0) / data.length;
            let numerator = 0, denominator = 0;

            for (let i = 0; i < data.length - lag; i++) {
                numerator += (data[i] - mean) * (data[i + lag] - mean);
            }
            for (let i = 0; i < data.length; i++) {
                denominator += Math.pow(data[i] - mean, 2);
            }

            return denominator !== 0 ? numerator / denominator : 0;
        };

        // Calculate the Mann-Kendall S statistic
        let S = 0;
        for (let i = 0; i < n - 1; i++) {
            for (let j = i + 1; j < n; j++) {
                S += Math.sign(values[j] - values[i]);
            }
        }

        // Calculate lag-1 autocorrelation (r1)
        const r1 = calculateAutoCorr(values, 1);

        // Compute the significance threshold for autocorrelations
        const significanceThreshold = 1.96 / Math.sqrt(n);

        // Compute the correction factor (CF) only for significant autocorrelations
        let CF = 1;
        if (r1 > 0) {
            for (let k = 1; k < n - 1; k++) {
                const rk = calculateAutoCorr(values, k);
                if (Math.abs(rk) > significanceThreshold) {
                    CF += 2 * (n - k) * (n - k - 1) * (n - k - 2) * rk / (n * (n - 1) * (n - 2));
                }
            }
        }

        // Compute the variance and apply the correction factor
        let variance = (n * (n - 1) * (2 * n + 5)) / 18;
        let modifiedVariance = variance * CF;

        // Compute Z-score
        let Z = 0;
        if (S > 0) Z = (S - 1) / Math.sqrt(modifiedVariance);
        else if (S < 0) Z = (S + 1) / Math.sqrt(modifiedVariance);

        // Compute p-value (two-tailed test)
        let pValue = 2 * (1 - jStat.normal.cdf(Math.abs(Z), 0, 1));

        // Compute Kendall’s tau
        let tau = S / (n * (n - 1) / 2);

        return {
            S: S,
            Z: Z,
            pValue: pValue,
            tau: tau,
            correctionFactor: CF,
            autoCorrelation: r1
        };
    }

    createTitles() {
        this.chartTitle = this.svg.append("text")
            .attr("class", "title trend-analysis")
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

    handleMouseOver(event, d) {

        if (typeof addHighlights_in_Highcharts === 'function') {
            addHighlights_in_Highcharts(d.from, d.to);
        }

        if (typeof addHighlightD3Glyphs === 'function') {
            addHighlightD3Glyphs(d.period, "brown");
        }

        // Highlight point
        d3.select(event.target)
            .raise() // Brings element to front
            .attr("r", 6)
            .attr("fill", "red");

        // this.tooltip.html(`
        //     <div style="padding: 3px; border-radius: 8px; box-shadow:0 10px 16px 0 rgba(0,0,0,0.2),0 6px 20px 0 rgba(0,0,0,0.19) !important;">
        //         <span style="color:blue">${d.period}</span><br/>
        //         HPCP: ${d.volume.toFixed(2)}
        //     </div>`)
        //     .style("visibility", "visible")
        //     .style("top", (event.pageY - 10) + "px")
        //     .style("left", (event.pageX + 10) + "px");

        this.tooltip
            .html(
                this.createTooltipFormat(d,
                    `<span style="color:blue">${d.period}</span><br/>
                HPCP: ${d.volume.toFixed(2)}
            `))
            .style("visibility", "visible")
            .style("top", (event.pageY - 10) + "px")
            .style("left", (event.pageX + 10) + "px");

    }

    handleMouseOut(event, d) {
        if (typeof removeHighlights_in_allHighcharts === 'function') {
            removeHighlights_in_allHighcharts();
        }

        if (typeof removeHighlightD3Glyphs === 'function') {
            removeHighlightD3Glyphs(d.period);
        }

        // Reset highlighted point
        d3.select(event.target)
            .attr("r", 3)
            .attr("fill", "steelblue");

        this.tooltip.style("visibility", "hidden");
    }

    resize() {
        // Check if the container is visible
        if (!this.isVisible()) return;

        // Update dimensions
        const container = d3.select(`#${this.containerId}`);
        this.width = parseInt(container.style('width'));
        this.innerWidth = this.width - this.margin.left - this.margin.right;

        // Update SVG width
        this.svg.attr("width", this.width);

        // Update scales
        this.xScale.range([0, this.innerWidth]);

        // Update axes
        this.svg.select(".x.axis")
            .transition()
            .duration(500)
            .call(d3.axisBottom(this.xScale)
                .ticks(d3.timeYear.every(1))
                .tickFormat(d3.timeFormat("%Y")))
            .on("end", () => {
                this.dedupeLabels(this.svg.select(".x.axis").selectAll(".tick text"));
            });

        // Update points
        this.points.transition()
            .duration(500)
            .attr("cx", d => this.margin.left + this.xScale(d.date));

        // Get current season and filter data
        const currentSeason = this.options.season;
        const seasonalData = this.filterDataBySeason(currentSeason);

        // Recalculate trend line
        if (seasonalData.length >= 2) {
            const xValues = seasonalData.map(d => d.date.getTime());
            const yValues = seasonalData.map(d => d.volume);

            let trend;
            switch(this.options.method) {
                case 'linear':
                    trend = this.calculateLinearTrend(xValues, yValues);
                    break;
                case 'polynomial':
                    trend = this.calculatePolynomialTrend(xValues, yValues, this.options.polynomialDegree);
                    break;
                case 'exponential':
                    trend = this.calculateExponentialTrend(xValues, yValues);
                    break;
            }

            // Remove existing trend line
            this.svg.selectAll(".trend-line").remove();

            if (trend) {
                // Draw trend line
                const lineGenerator = d3.line()
                    .x(d => this.margin.left + this.xScale(d.date))
                    .y(d => this.margin.top + this.yScale(trend.predict(d.date.getTime())));

                this.trendLine = this.svg.append("path")
                    .datum(seasonalData)
                    .attr("class", "trend-line")
                    .attr("fill", "none")
                    .attr("stroke", this.trendColors[this.options.method])
                    .attr("stroke-width", 2)
                    .attr("d", lineGenerator);
            }
        }

        // Update title position
        this.chartTitle
            .attr("x", this.margin.left + this.innerWidth/2);

        // Update method selector position
        this.updateMethodSelectorPosition();

        // Update R-squared text position
        if (this.rSquaredText) {
            this.rSquaredText.attr("x", this.margin.left * 1/5);
        }
    }


    async updateData(newIETDData, newIETDHour) {
        this.IETDData = newIETDData;
        this.IETDhour = newIETDHour;

        this.processData();

        // Get current season selection
        const currentSeason = this.options.season;

        // Filter data by current season
        const seasonalData = this.filterDataBySeason(currentSeason);

        // Update scales with seasonal data
        this.xScale.domain(d3.extent(seasonalData, d => d.date));
        this.yScale.domain([0, d3.max(seasonalData, d => d.volume)]);

        this.svg.select(".no-data-message").remove();

        // Check if enough data elements
        if (seasonalData.length < 50) {
            // Remove existing elements
            this.svg.selectAll(".trendanalysis_point").remove();
            this.svg.selectAll(".trend-line").remove();

            // Add message in the middle of the chart
            this.svg.append("text")
                .attr("class", "no-data-message")
                .attr("x", this.innerWidth / 2)
                .attr("y", this.innerHeight / 2)
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .style("font-size", "14px")
                .style("fill", "#666")
                .text("Not enough data!");

            return;
        }

        // Update axes
        this.svg.select(".x.axis")
            .transition()
            .duration(750)
            .call(d3.axisBottom(this.xScale)
                .ticks(d3.timeYear.every(1))
                .tickFormat(d3.timeFormat("%Y")))
            .on("end", () => {
                this.dedupeLabels(this.svg.select(".x.axis").selectAll(".tick text"));
            });

        this.svg.select(".y.axis")
            .transition()
            .duration(750)
            .call(d3.axisLeft(this.yScale).ticks(5)
                .tickFormat(d => d3.format("")(d)));

        // Update points
        const points = this.svg.selectAll(".trendanalysis_point")
            .data(this.formattedData);

        points.exit().remove();

        points.transition()
            .duration(750)
            .attr("cx", d => this.margin.left + this.xScale(d.date))
            .attr("cy", d => this.margin.top + this.yScale(d.volume))
            .style("display", d =>
                currentSeason === 'all' || this.getSeason(d.date) === currentSeason ? null : "none");

        points.enter()
            .append("circle")
            .attr("class", "trendanalysis_point")
            .attr("data-indicator", d => d.period)
            .attr("r", 3)
            .attr("fill", "steelblue")
            .attr("opacity", 0.6)
            .attr("cx", d => this.margin.left + this.xScale(d.date))
            .attr("cy", d => this.margin.top + this.yScale(d.volume))
            .style("display", d =>
                currentSeason === 'all' || this.getSeason(d.date) === currentSeason ? null : "none")
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));

        // Update trend line using seasonal data
        if (seasonalData.length >= 2) {
            const xValues = seasonalData.map(d => d.date.getTime());
            const yValues = seasonalData.map(d => d.volume);

            let trend;
            switch(this.options.method) {
                case 'linear':
                    trend = this.calculateLinearTrend(xValues, yValues);
                    break;
                case 'polynomial':
                    trend = this.calculatePolynomialTrend(xValues, yValues, this.options.polynomialDegree);
                    break;
                case 'exponential':
                    trend = this.calculateExponentialTrend(xValues, yValues);
                    break;
            }

            // Remove existing trend line and R² text
            this.svg.selectAll(".trend-line").remove();

            if (trend) {
                const mkResult = this.calculateMannKendall(yValues);

                // Draw trend line
                const lineGenerator = d3.line()
                    .x(d => this.margin.left + this.xScale(d.date))
                    .y(d => this.margin.top + this.yScale(trend.predict(d.date.getTime())));

                this.trendLine = this.svg.append("path")
                    .datum(seasonalData)
                    .attr("class", "trend-line")
                    .attr("fill", "none")
                    .attr("stroke", this.trendColors[this.options.method])
                    .attr("stroke-width", 2)
                    .attr("d", lineGenerator);

                // add statistics
                this.addStatistics(trend, mkResult);
            }
        }

        // Update title
        this.updateTitle();

        // Update season selector if it exists
        const seasonSelect = d3.select(`#${this.containerId}`).select(".season-select");
        if (!seasonSelect.empty()) {
            seasonSelect.property("value", currentSeason);
        }
    }

    updateTitle() {
        if (this.options.season === 'all') {
            this.chartTitle.text(this.title);
        }
        else {
            const season = this.seasons.find(s => s.id === this.options.season);
            this.chartTitle.text(this.title + ' (' + (season ? season.label : '') + ')');
        }
    }


    addHighlights(indicator) {
        // Select circles with a specific data-indicator value
        const selectedPoints = this.svg.selectAll("circle.trendanalysis_point")
            .filter(function() {
                return (d3.select(this).attr("data-indicator") === indicator);
            });

        // Apply styling to all matching circles
        selectedPoints
            .attr("r", 6)
            .attr("stroke-width", 2)
            .attr("fill", "brown");
    }

    removeHighlights(indicator) {
        const selectedPoints = this.svg.selectAll("circle.trendanalysis_point")
            .filter(function() {
                return (d3.select(this).attr("fill") === "brown");
            });

        selectedPoints
            .attr("r", 3)
            .attr("stroke-width", 1)
            .attr("fill", "steelblue");
    }

    destroy() {
        try {
            // Remove window event listener
            window.removeEventListener('resize', this.resize);

            // Get container
            const container = d3.select(`#${this.containerId}`);

            // Remove all SVG elements
            container.select("svg").remove();

            // Remove tooltip
            if (this.tooltip) {
                this.tooltip.remove();
                this.tooltip = null;
            }

            // Remove season selector
            container.select(".season-selector-container").remove();

            // Remove all specific elements
            container.selectAll(".trendanalysis_point").remove();
            container.selectAll(".trend-line").remove();
            container.selectAll(".method-selector").remove();
            container.selectAll(".season-selector").remove();
            container.selectAll(".radio-group").remove();
            container.selectAll(".stats-container").remove();
            container.selectAll(".y.axis").remove();
            container.selectAll(".title").remove();
            container.selectAll(".trend-analysis").remove();
            container.selectAll(".no-data-message").remove();

            // Remove all event listeners
            container.selectAll(".trendanalysis_point")
                .on("mouseover", null)
                .on("mouseout", null);

            container.selectAll(".radio-button")
                .on("mouseover", null)
                .on("mouseout", null)
                .on("click", null);

            container.selectAll(".season-select")
                .on("change", null);

            // Clear all data references
            this.IETDData = null;
            this.IETDhour = null;
            this.formattedData = null;
            this.svg = null;
            this.tooltip = null;
            this.xScale = null;
            this.yScale = null;
            this.xAxis = null;
            this.yAxis = null;
            this.points = null;
            this.trendLine = null;
            this.chartTitle = null;
            this.rSquaredText = null;
            this.trends = null;
            this.currentTrend = null;
            this.slope = null;
            this.intercept = null;

            // Clear options and colors
            this.options = null;
            this.trendColors = null;

            // Clear dimensions
            this.width = null;
            this.height = null;
            this.innerWidth = null;
            this.innerHeight = null;
            this.margin = null;

            // Clear bound methods
            this.resize = null;
            this.processData = null;
            this.timeFormat = null;
            this.updateSeason = null;
            this.updateTrendMethod = null;
            this.filterDataBySeason = null;
            this.getSeason = null;
            this.dedupeLabels = null;
            this.handleMouseOver = null;
            this.handleMouseOut = null;
            this.createTooltipFormat = null;

            // Clear calculation methods
            this.calculateTrends = null;
            this.calculateLinearTrend = null;
            this.calculatePolynomialTrend = null;
            this.calculateExponentialTrend = null;
            this.calculateRSquared = null;

            // Clear matrix operation helpers
            this.transpose = null;
            this.matrixMultiply = null;
            this.inverseMatrix = null;

            // Clear the container reference
            this.containerId = null;

            // Call parent's destroy method
            super.destroy();

            // Force garbage collection (if supported)
            if (window.gc) {
                window.gc();
            }

        } catch (error) {
            console.error('Error in destroy:', error);
        }
    }
}